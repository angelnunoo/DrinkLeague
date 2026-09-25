import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { flushRecentPushes } from "@/lib/notifications";

/** Flush recent activity notifications as web push for the current user. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const pushed = await flushRecentPushes(user.id);
  return NextResponse.json({ ok: true, pushed });
}
