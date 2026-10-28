import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError =
    searchParams.get("error_description") || searchParams.get("error");
  const next = searchParams.get("next") ?? "/scanner";

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/auth?error=auth_exchange_failed&message=${encodeURIComponent(
        oauthError
      )}`
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
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
