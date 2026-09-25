import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export function createClient() {
  const cfg = getSupabasePublicConfig();
  if (!cfg) {
    throw new Error("Supabase no configurado");
  }
  return createBrowserClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
