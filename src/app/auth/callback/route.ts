import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  clockSkewSafeFetch,
  repairSkewedCookieArray,
} from "@/lib/supabase/clockSkewFetch";
import type { Database } from "@/lib/supabase/database.types";

function extractHostFromUrlOrHost(raw?: string): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  try {
    if (trimmed.includes("://")) {
      return new URL(trimmed).host.toLowerCase();
    }
    return new URL(`https://${trimmed}`).host.toLowerCase();
  } catch {
    return null;
  }
}

function resolveSafeRedirectBase(request: Request, requestUrl: URL): string {
  const origin = requestUrl.origin;
  const isLocalEnv =
    process.env.NODE_ENV === "development" ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1");

  if (isLocalEnv) {
    return origin;
  }

  const allowedHosts = new Set<string>([requestUrl.host.toLowerCase()]);
  const envCandidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ];
  for (const candidate of envCandidates) {
    const parsedHost = extractHostFromUrlOrHost(candidate);
    if (parsedHost) {
      allowedHosts.add(parsedHost);
    }
  }

  const rawForwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  if (rawForwardedHost && allowedHosts.has(rawForwardedHost)) {
    return `https://${rawForwardedHost}`;
  }

  return origin;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const redirectBase = resolveSafeRedirectBase(request, requestUrl);
  const code = searchParams.get("code");
  const oauthError =
    searchParams.get("error_description") || searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${redirectBase}/auth?error=auth_exchange_failed&message=${encodeURIComponent(
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
    const finalNext =
      resolvedNext.startsWith("/") && !resolvedNext.startsWith("//")
        ? resolvedNext
        : "/scanner";

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
            const adminClient = createSupabaseAdminClient<Database>(
              supabaseUrl,
              serviceRoleKey,
              {
                auth: { persistSession: false, autoRefreshToken: false },
              }
            );
            await adminClient.from("profiles").delete().eq("id", user.id);
            await adminClient.auth.admin.deleteUser(user.id);
          } catch (cleanupErr) {
            console.warn(
              "Failed to clean up rejected OAuth sign-in user via service role client:",
              cleanupErr
            );
          }
        } else {
          console.warn(
            "SUPABASE_SERVICE_ROLE_KEY is not configured; rejected OAuth sign-in user and profile could not be deleted via admin client."
          );
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
      `${redirectBase}/auth?error=auth_exchange_failed&message=${encodeURIComponent(
        error?.message || "Failed to exchange OAuth code for session."
      )}`
    );
  }

  // Return the user to login with instructions
  return NextResponse.redirect(
    `${redirectBase}/auth?error=auth_exchange_failed&message=${encodeURIComponent(
      "No authorization code received from OAuth callback."
    )}`
  );
}
