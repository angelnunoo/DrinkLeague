import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function createClient() {
  const cfg = getSupabasePublicConfig();
  if (!cfg) {
    throw new Error("Supabase no configurado");
  }
  const cookieStore = await cookies();
  const https =
    process.env.NODE_ENV === "production" ||
    (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");

  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, authCookieOptions(options, { https }));
          });
        } catch {
          // Server Component — session refresh happens in middleware.
        }
      },
    },
  });
}
