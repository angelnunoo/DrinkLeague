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
  { key: "boost", label: "SuperAumentos" },
  { key: "games", label: "Juegos" },
  { key: "events", label: "Eventos" },
  { key: "birthday", label: "Cumpleaños" },
  { key: "challenges", label: "Retos" },
  { key: "seasons", label: "Temporadas" },
  { key: "records", label: "Récords" },
  { key: "weekly", label: "Resúmenes" },
] as const;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; settings?: string; q?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;
  const cat = sp.cat || "all";
  const q = (sp.q || "").trim();
  const showSettings = sp.settings === "1";

  const supabase = await createClient();
  await supabase.rpc("ensure_notification_prefs", { p_user_id: profile.id });
  await supabase.rpc("notify_birthday_today");
  await supabase.rpc("refresh_user_persona", { p_user_id: profile.id });

  // Sunday weekly summary (Europe/Madrid)
  const madridDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    weekday: "short",
  }).format(new Date());
  if (madridDay === "Sun") {
    await supabase.rpc("generate_weekly_summary", { p_user_id: profile.id });
  }

  let query = supabase
    .from("activity_notifications")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (cat !== "all") query = query.eq("category", cat);
  if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);

  const [{ data: items }, { data: prefs }, { count: unread }] = await Promise.all([
    query,
    supabase.from("notification_preferences").select("*").eq("user_id", profile.id).maybeSingle(),
    supabase
      .from("activity_notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("is_read", false),
  ]);

  const filterHref = (next: { cat?: string; q?: string }) => {
    const params = new URLSearchParams();
    const c = next.cat ?? cat;
    const search = next.q ?? q;
    if (c && c !== "all") params.set("cat", c);
    if (search) params.set("q", search);
    const s = params.toString();
    return s ? `/app/activity?${s}` : "/app/activity";
  };

  return (
    <section className="animate-rise space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Centro</p>
          <h1 className="font-display text-3xl">🔔 Actividad</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {unread ?? 0} sin leer · eventos reales, sin spam genérico
          </p>
        </div>
        <Link
          href={showSettings ? "/app/activity" : "/app/activity?settings=1"}
          className="btn-ghost text-xs"
        >
          {showSettings ? "Ver feed" : "Ajustes"}
        </Link>
      </div>

      {showSettings ? (
        <div className="space-y-4">
          <PushRegistrar />
          <NotificationPrefsForm prefs={prefs} />
        </div>
      ) : (
        <>
          <form action="/app/activity" method="get" className="flex gap-2">
            {cat !== "all" ? <input type="hidden" name="cat" value={cat} /> : null}
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar actividad…"
              className="flex-1 rounded-xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--amber)]"
            />
            <button type="submit" className="btn-ghost text-xs shrink-0">
              Buscar
            </button>
          </form>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => (
              <Link
                key={c.key}
                href={filterHref({ cat: c.key })}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  cat === c.key
                    ? "bg-[var(--ink)] text-[#0b1512]"
                    : "border border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {c.label}
              </Link>
            ))}
          </div>

          {(unread ?? 0) > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button type="submit" className="btn-ghost text-xs">
                Marcar todas como leídas
              </button>
            </form>
          ) : null}

          <ul className="space-y-2">
            {(items ?? []).map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href || "/app/activity"}
                  className={`rank-row block px-4 py-3 ${n.is_read ? "opacity-70" : "rank-row-me"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                        {NOTIFY_CATEGORY_LABELS[n.category] ?? n.category}
                      </p>
                      <p className="font-semibold">{n.title}</p>
                      <p className="text-sm text-[var(--muted)]">{n.body}</p>
                    </div>
                    {!n.is_read ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--amber)]" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    {new Date(n.created_at).toLocaleString("es-ES")}
                  </p>
                </Link>
              </li>
            ))}
            {!items?.length ? (
              <li className="surface p-6 text-center text-sm text-[var(--muted)]">
                {q
                  ? "Ninguna actividad coincide con la búsqueda."
                  : "Aún no hay actividad. Cuando pase algo real (rival, logro, apuesta…), aparecerá aquí."}
              </li>
            ) : null}
          </ul>
        </>
      )}
    </section>
  );
}
