import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

export type NotifyCategory =
  | "rivalry"
  | "ranking"
  | "achievement"
  | "chemistry"
  | "bets"
  | "boost"
  | "mvp"
  | "games"
  | "events"
  | "birthday"
  | "challenges"
  | "weekly"
  | "seasons"
  | "records";

export const NOTIFY_CATEGORY_LABELS: Record<NotifyCategory | string, string> = {
  rivalry: "Rivalidades",
  ranking: "Clasificación",
  achievement: "Logros",
  chemistry: "Química",
  bets: "Apuestas",
  boost: "SuperAumentos",
  mvp: "MVP",
  games: "Juegos",
  events: "Eventos",
  birthday: "Cumpleaños",
  challenges: "Retos",
  weekly: "Resúmenes",
  seasons: "Temporadas",
  records: "Récords",
};

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@drinkleague.app";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/** Insert activity notification (respects prefs) and fan-out web push. */
export async function notifyAndPush(params: {
  userId: string;
  category: NotifyCategory;
  title: string;
  body: string;
  href?: string;
  payload?: Record<string, unknown>;
}): Promise<{ notificationId: string | null; pushed: number }> {
  const supabase = await createClient();
  const { data: notifId } = await supabase.rpc("notify_user", {
    p_user_id: params.userId,
    p_category: params.category,
    p_title: params.title,
    p_body: params.body,
    p_href: params.href ?? null,
    p_payload: params.payload ?? {},
  });

  if (!notifId) return { notificationId: null, pushed: 0 };

  const pushed = await pushToUser(params.userId, {
    title: params.title,
    body: params.body,
    href: params.href,
    category: params.category,
  });

  return { notificationId: String(notifId), pushed };
}

export async function pushToUser(
  userId: string,
  payload: { title: string; body: string; href?: string; category?: string },
): Promise<number> {
  if (!configureWebPush()) return 0;

  const supabase = await createClient();
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("push_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefs && prefs.push_enabled === false) return 0;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs?.length) return 0;

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          url: payload.href || "/app/activity",
          category: payload.category,
        }),
      );
      sent += 1;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }
  return sent;
}

/** After refresh_legacy_hub, push any unread created in the last minute. */
export async function flushRecentPushes(userId: string): Promise<number> {
  if (!configureWebPush()) return 0;
  const supabase = await createClient();
  const since = new Date(Date.now() - 90_000).toISOString();
  const { data: rows } = await supabase
    .from("activity_notifications")
    .select("id, title, body, href, category")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);

  let total = 0;
  for (const row of rows ?? []) {
    total += await pushToUser(userId, {
      title: row.title,
      body: row.body,
      href: row.href ?? "/app/activity",
      category: row.category,
    });
  }
  return total;
}
