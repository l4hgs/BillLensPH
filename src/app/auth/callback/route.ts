import { createServerClient } from "@supabase/ssr";
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
  const next = searchParams.get("next") ?? "/scanner";
  const safeNext = next.startsWith("/") ? next : "/scanner";

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/auth?error=auth_exchange_failed&message=${encodeURIComponent(
        oauthError
      )}`
    );
  }

  if (code) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocalEnv = process.env.NODE_ENV === "development";
    const redirectBase =
      !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;
    const redirectResponse = NextResponse.redirect(`${redirectBase}${safeNext}`);

    const cookieStore = await cookies();
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://placeholder-project.supabase.co";
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectResponse;
    }

    return NextResponse.redirect(
      `${origin}/auth?error=auth_exchange_failed&message=${encodeURIComponent(
        error.message
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
