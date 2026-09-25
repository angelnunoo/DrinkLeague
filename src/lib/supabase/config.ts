/** Shared Supabase public config with Netlify-safe fallbacks. */
export function getSupabasePublicConfig(): { url: string; anonKey: string } | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "https://vujmastqxbhmqwwazbdu.supabase.co";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1am1hc3RxeGJobXF3d2F6YmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMjAwMzAsImV4cCI6MjEwNTg5NjAzMH0.iuryGViwzWy8RYUagOIk0-_R8-e6XlWVfbPIFF7Axk8";

  if (!url || !anonKey || url.includes("YOUR_PROJECT")) return null;
  return { url, anonKey };
}
