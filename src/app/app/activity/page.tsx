import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { markAllNotificationsReadAction } from "@/app/actions";
import { PushRegistrar } from "@/components/push-registrar";
import { NotificationPrefsForm } from "@/components/notification-prefs-form";
import { NOTIFY_CATEGORY_LABELS } from "@/lib/notifications";

const CATEGORIES = [
  { key: "all", label: "Todas" },
  { key: "rivalry", label: "Rivales" },
  { key: "ranking", label: "Clasificación" },
  { key: "achievement", label: "Logros" },
  { key: "chemistry", label: "Química" },
  { key: "mvp", label: "MVP" },
  { key: "bets", label: "Apuestas" },
  { key: "games", label: "Juegos" },
  { key: "challenges", label: "Retos" },
  { key: "seasons", label: "Temporadas" },
] as const;

type FeedItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
  actor_name?: string;
  event_type?: string;
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; settings?: string; q?: string; tab?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;
  const tab = sp.tab === "alerts" ? "alerts" : "feed";
  const cat = sp.cat || "all";
  const q = (sp.q || "").trim();
  const showSettings = sp.settings === "1";

  const supabase = await createClient();
  await supabase.rpc("ensure_notification_prefs", { p_user_id: profile.id });
  await supabase.rpc("notify_birthday_today");

  const [{ data: feedRaw }, { data: items }, { data: prefs }, { count: unread }] =
    await Promise.all([
      supabase.rpc("get_social_feed", { p_limit: 40 }),
      (async () => {
        let query = supabase
          .from("activity_notifications")
          .select("*")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(80);
        if (cat !== "all") query = query.eq("category", cat);
        if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
        return query;
      })(),
      supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", profile.id)
        .maybeSingle(),
      supabase
        .from("activity_notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("is_read", false),
    ]);

  const feed = (Array.isArray(feedRaw) ? feedRaw : []) as FeedItem[];

  return (
    <section className="animate-rise space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">📰 Actividad</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Feed social y notificaciones
          </p>
        </div>
        <Link
          href={showSettings ? "/app/activity" : "/app/activity?settings=1"}
          className="btn-ghost px-3 py-2 text-xs"
        >
          {showSettings ? "Volver" : "Ajustes"}
        </Link>
      </div>

      <div className="flex gap-2">
        <Link
          href="/app/activity"
          className={`min-h-10 flex-1 rounded-full text-center text-sm font-semibold leading-10 ${
            tab === "feed" ? "bg-[var(--ink)] text-[#0b1512]" : "border border-[var(--line)]"
          }`}
        >
          Feed
        </Link>
        <Link
          href="/app/activity?tab=alerts"
          className={`min-h-10 flex-1 rounded-full text-center text-sm font-semibold leading-10 ${
            tab === "alerts" ? "bg-[var(--ink)] text-[#0b1512]" : "border border-[var(--line)]"
          }`}
        >
          Alertas{(unread ?? 0) > 0 ? ` (${unread})` : ""}
        </Link>
      </div>

      {showSettings ? (
        <div className="space-y-4">
          <PushRegistrar />
          <NotificationPrefsForm prefs={prefs} />
        </div>
      ) : tab === "feed" ? (
        <div className="space-y-3">
          {!feed.length ? (
            <div className="surface p-5 text-sm text-[var(--muted)]">
              Aún no hay movimientos. Añade amigos y juega para llenar el feed.
            </div>
          ) : (
            feed.map((item) => (
              <Link
                key={item.id}
                href={item.href || "/app/activity"}
                className="surface block p-4 transition hover:border-[var(--teal)]"
              >
                <p className="font-semibold">{item.title}</p>
                {item.body ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.body}</p>
                ) : null}
                <p className="mt-2 text-[10px] text-[var(--muted)]">
                  {item.actor_name ? `${item.actor_name} · ` : ""}
                  {new Date(item.created_at).toLocaleString("es-ES", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </Link>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Link
                key={c.key}
                href={c.key === "all" ? "/app/activity?tab=alerts" : `/app/activity?tab=alerts&cat=${c.key}`}
                className={`rounded-full border px-3 py-1 text-xs ${
                  cat === c.key
                    ? "border-[var(--amber)] text-[var(--amber)]"
                    : "border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {c.label}
              </Link>
            ))}
          </div>
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="btn-ghost text-xs">
              Marcar todo leído
            </button>
          </form>
          <ul className="space-y-2">
            {(items ?? []).map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href || "/app/activity"}
                  className={`surface block p-4 ${n.is_read ? "opacity-70" : ""}`}
                >
                  <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    {NOTIFY_CATEGORY_LABELS[n.category] ?? n.category}
                  </p>
                  <p className="font-semibold">{n.title}</p>
                  {n.body ? <p className="mt-1 text-sm text-[var(--muted)]">{n.body}</p> : null}
                </Link>
              </li>
            ))}
            {!items?.length ? (
              <li className="text-sm text-[var(--muted)]">Sin notificaciones.</li>
            ) : null}
          </ul>
        </div>
      )}
    </section>
  );
}
