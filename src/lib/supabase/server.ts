import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

export async function createClient() {
  const cookieStore = await cookies();
  const https =
    process.env.NODE_ENV === "production" ||
    (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  );
}
