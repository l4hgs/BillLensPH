import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { Database } from "./database.types";
import {
  clockSkewSafeFetch,
  repairSkewedCookieArray,
} from "./clockSkewFetch";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Gracefully bypass if Supabase env vars are not set during early local prototyping
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  // Never run `getUser()` in middleware on `/auth/callback`: if an expired session
  // cookie is present alongside a fresh PKCE `code_verifier` cookie, a failed
  // `getUser()` triggers `_removeSession()` -> `removeAllPKCEVerifiers()`, which
  // wipes the PKCE verifier before the callback route handler can exchange `code`!
  if (request.nextUrl.pathname.startsWith("/auth/callback")) {
    return supabaseResponse;
  }

  const allRequestCookies = request.cookies.getAll();
  const hasAuthTokenCookie = allRequestCookies.some((c) =>
    /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/.test(c.name)
  );
  if (!hasAuthTokenCookie) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: clockSkewSafeFetch,
    },
    cookies: {
      getAll() {
        return repairSkewedCookieArray(request.cookies.getAll());
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the auth token if needed
  await supabase.auth.getUser();

  return supabaseResponse;
}
