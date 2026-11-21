import { createClient } from "@/lib/supabase/server";
import { AuthClient } from "@/components/auth/AuthClient";
import type { User } from "@supabase/supabase-js";

export default async function AuthPage() {
  let initialUser: User | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    initialUser = user ?? null;
  } catch {
    initialUser = null;
  }

  return <AuthClient initialUser={initialUser} />;
}
