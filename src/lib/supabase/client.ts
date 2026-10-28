import { createBrowserClient } from "@supabase/ssr";
import { Database } from "./database.types";
import {
  clockSkewSafeFetch,
  repairSkewedBrowserAuthCookies,
} from "./clockSkewFetch";

export function createClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://placeholder-project.supabase.co";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  repairSkewedBrowserAuthCookies();

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: clockSkewSafeFetch,
    },
  });
}
