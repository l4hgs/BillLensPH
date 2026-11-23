import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "@/components/home/HomeClient";
import type { User } from "@supabase/supabase-js";

interface HomePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const code = typeof params?.code === "string" ? params.code : undefined;
  const oauthError =
    typeof params?.error_description === "string"
      ? params.error_description
      : typeof params?.error === "string"
        ? params.error
        : undefined;

  if (code || oauthError) {
    const callbackParams = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === "string") {
          callbackParams.set(key, value);
        }
      }
    }
    redirect(`/auth/callback?${callbackParams.toString()}`);
  }

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
