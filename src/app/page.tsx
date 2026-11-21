import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "@/components/home/HomeClient";
import type { User } from "@supabase/supabase-js";

export default async function HomePage() {
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

  return <HomeClient initialUser={initialUser} />;
}
