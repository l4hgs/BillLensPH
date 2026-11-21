import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  clockSkewSafeFetch,
  repairSkewedCookieArray,
} from "@/lib/supabase/clockSkewFetch";
import type { Database } from "@/lib/supabase/database.types";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError =
    searchParams.get("error_description") || searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/auth?error=auth_exchange_failed&message=${encodeURIComponent(
        oauthError
      )}`
    );
  }

  if (code) {
    const cookieStore = await cookies();
    const cookieNext = cookieStore.get("billlens_auth_next")?.value;
    const authMode = cookieStore.get("billlens_auth_mode")?.value || "signin";
    const resolvedNext =
      searchParams.get("next") ||
      (cookieNext ? decodeURIComponent(cookieNext) : "/scanner");
    const finalNext = resolvedNext.startsWith("/") ? resolvedNext : "/scanner";

    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocalEnv =
      process.env.NODE_ENV === "development" ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1");
    const redirectBase =
      !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;
    const redirectResponse = NextResponse.redirect(
      `${redirectBase}${finalNext}`
    );
    redirectResponse.cookies.set("billlens_auth_next", "", {
      path: "/",
      maxAge: 0,
    });
    redirectResponse.cookies.set("billlens_auth_mode", "", {
      path: "/",
      maxAge: 0,
    });

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://placeholder-project.supabase.co";
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

    const setAuthCookieNames = new Set<string>();

    const supabase = createServerClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          fetch: clockSkewSafeFetch,
        },
        cookies: {
          getAll() {
            return repairSkewedCookieArray(cookieStore.getAll());
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              setAuthCookieNames.add(name);
              try {
                cookieStore.set(name, value, options);
              } catch {
                // Ignore if cookieStore is read-only
              }
              redirectResponse.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      const user = data.user;

      // Enforce Sign In vs. Create Account separation:
      // If the user clicked "Sign In" (mode === "signin"), verify whether this account
      // was just auto-created by Supabase OAuth during this request.
      const createdAtMs = user.created_at
        ? new Date(user.created_at).getTime()
        : 0;
      const lastSignInMs = user.last_sign_in_at
        ? new Date(user.last_sign_in_at).getTime()
        : createdAtMs;
      const isBrandNewOAuthUser =
        createdAtMs > 0 && Math.abs(lastSignInMs - createdAtMs) < 15000;

      // Also verify if an unregistered user had their profile deleted previously on signin
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (authMode === "signin" && (isBrandNewOAuthUser || !existingProfile)) {
        // Clean up the auto-created account so Sign In never creates a new account
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (serviceRoleKey && !supabaseUrl.includes("placeholder-project")) {
          try {
            const adminClient = createSupabaseAdminClient(
              supabaseUrl,
              serviceRoleKey,
              {
                auth: { persistSession: false, autoRefreshToken: false },
              }
            );
            await adminClient.auth.admin.deleteUser(user.id);
          } catch {
            // Fallback if service role deletion fails
          }
        }

        // Remove profile row (if not already cascade-deleted) and sign out the session
        try {
          await supabase.from("profiles").delete().eq("id", user.id);
        } catch {
          // Ignore if RLS blocks profile delete
        }
        await supabase.auth.signOut();

        const rejectRedirect = NextResponse.redirect(
          `${redirectBase}/auth?mode=signup&error=account_not_found&message=${encodeURIComponent(
            "No existing account was found for that Google email. Please use Create Account to sign up first."
          )}`
        );
        rejectRedirect.cookies.set("billlens_auth_next", "", {
          path: "/",
          maxAge: 0,
        });
        rejectRedirect.cookies.set("billlens_auth_mode", "", {
          path: "/",
          maxAge: 0,
        });
        // Expire all Supabase auth cookies so the rejected session is completely cleared
        cookieStore.getAll().forEach((c) => {
          if (c.name.startsWith("sb-")) {
            rejectRedirect.cookies.set(c.name, "", { path: "/", maxAge: 0 });
          }
        });
        setAuthCookieNames.forEach((name) => {
          rejectRedirect.cookies.set(name, "", { path: "/", maxAge: 0 });
        });

        return rejectRedirect;
      }

      // If the user explicitly used "Create Account" (mode === "signup") and their profile
      // row was previously absent, ensure their profile row exists.
      if (authMode === "signup" && !existingProfile) {
        const fallbackName =
          (user.user_metadata?.full_name as string | undefined) ||
          user.email?.split("@")[0] ||
          "BillLens User";
        await supabase.from("profiles").upsert({
          id: user.id,
          full_name: fallbackName,
        });
      }

      return redirectResponse;
    }

    return NextResponse.redirect(
      `${origin}/auth?error=auth_exchange_failed&message=${encodeURIComponent(
        error?.message || "Failed to exchange OAuth code for session."
      )}`
    );
  }

  // Return the user to login with instructions
  return NextResponse.redirect(
    `${origin}/auth?error=auth_exchange_failed&message=${encodeURIComponent(
      "No authorization code received from OAuth callback."
    )}`
  );
}
