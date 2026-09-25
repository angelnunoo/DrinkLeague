import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** OAuth / magic-link / password-recovery callback — exchanges code for session cookies. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/app"}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
