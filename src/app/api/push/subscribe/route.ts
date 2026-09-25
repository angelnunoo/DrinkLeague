import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const body = await request.json();
  const endpoint = String(body.endpoint ?? "");
  const p256dh = String(body.keys?.p256dh ?? "");
  const auth = String(body.keys?.auth ?? "");
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  await supabase.rpc("ensure_notification_prefs", { p_user_id: user.id });

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const endpoint = String(body.endpoint ?? "");
  if (endpoint) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  } else {
    await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
  }
  return NextResponse.json({ ok: true });
}
