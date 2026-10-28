import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Database } from "./database.types";
import {
  clockSkewSafeFetch,
  repairSkewedCookieArray,
} from "./clockSkewFetch";

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://placeholder-project.supabase.co";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: clockSkewSafeFetch,
    },
    cookies: {
      getAll() {
        return repairSkewedCookieArray(cookieStore.getAll());
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
        }
      },
    },
  });
}
