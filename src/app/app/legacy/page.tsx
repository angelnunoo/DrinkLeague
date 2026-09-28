import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

type LegacyEvent = {
  id: string;
  event_code: string;
  title: string;
  body: string | null;
  emoji: string;
  occurred_at: string;
};

type PersonalRecord = {
  record_code: string;
  label: string;
  value: number;
  achieved_at: string;
};

export default async function LegacyPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  await supabase.rpc("rebuild_user_legacy");
  await supabase.rpc("refresh_season_objectives");
  await supabase.rpc("refresh_leadership_streaks");

  const [
    { data: events },
    { data: records },
    { data: objectives },
    { data: leadership },
  ] = await Promise.all([
    supabase
      .from("user_legacy_events")
      .select("*")
      .eq("user_id", profile.id)
      .order("occurred_at", { ascending: true }),
    supabase
      .from("user_personal_records")
      .select("*")
      .eq("user_id", profile.id)
      .order("value", { ascending: false }),
    supabase
      .from("personal_objectives")
      .select("*")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    supabase
      .from("leadership_streaks")
      .select("*, leagues(name)")
      .eq("user_id", profile.id)
      .order("current_count", { ascending: false }),
  ]);

  const byYear = new Map<number, LegacyEvent[]>();
  for (const e of (events ?? []) as LegacyEvent[]) {
    const y = new Date(e.occurred_at).getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(e);
  }

  return (
    <section className="animate-rise space-y-6">
      <div>
        <Link href="/app/profile" className="text-sm text-[var(--muted)]">
          ← Perfil
        </Link>
        <h1 className="mt-2 font-display text-3xl">📜 Legado</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Tu historia en DrinkLeague, construida automáticamente.
        </p>
      </div>

      <div className="surface p-5">
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Registro</p>
        <p className="font-display text-2xl">
          {new Date(profile.created_at).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {(leadership ?? []).length ? (
        <div className="surface space-y-3 p-5">
          <h2 className="font-display text-xl">👑 Rachas de liderazgo</h2>
          <ul className="space-y-2">
            {(leadership ?? []).map((row) => {
              const league = row.leagues as unknown as { name: string } | null;
              return (
                <li key={`${row.league_id}-${row.period}`} className="text-sm">
                  <span className="font-semibold">{league?.name ?? "Liga"}</span>
                  {" · "}
                  {row.period === "week" ? "Semanas" : row.period} líder:{" "}
                  <span className="text-[var(--amber)]">{row.current_count}</span>
                  <span className="text-[var(--muted)]"> (mejor {row.best_count})</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="surface space-y-3 p-5">
        <h2 className="font-display text-xl">🎯 Objetivos de temporada</h2>
        {!(objectives ?? []).length ? (
          <p className="text-sm text-[var(--muted)]">Sin objetivos activos.</p>
        ) : (
          <ul className="space-y-3">
            {(objectives ?? []).map((o) => {
              const cur = Number(o.current_value ?? 0);
              const tgt = Number(o.target ?? 1);
              const pct = Math.min(100, Math.round((cur / Math.max(tgt, 1)) * 100));
              return (
                <li key={o.id}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{o.title}</span>
                    <span className="text-[var(--muted)]">
                      {cur}/{tgt}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--line)]">
                    <div
                      className="h-full rounded-full bg-[var(--teal)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="surface space-y-3 p-5">
        <h2 className="font-display text-xl">🏆 Récords personales</h2>
        {!(records ?? []).length ? (
          <p className="text-sm text-[var(--muted)]">Aún no hay récords.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {((records ?? []) as PersonalRecord[]).map((r) => (
              <li key={r.record_code} className="stat-chip p-3">
                <p className="text-[10px] text-[var(--muted)]">{r.label}</p>
                <p className="font-display text-2xl text-[var(--amber)]">
                  {Number(r.value).toLocaleString("es-ES")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-5">
        <h2 className="font-display text-xl">Timeline histórico</h2>
        {[...byYear.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([year, list]) => (
            <div key={year} className="surface p-5">
              <p className="font-display text-2xl text-[var(--amber)]">{year}</p>
              <ul className="mt-3 space-y-3 border-l border-[var(--line)] pl-4">
                {list.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[1.35rem] top-0.5 text-sm">{e.emoji}</span>
                    <p className="font-semibold">{e.title}</p>
                    {e.body ? <p className="text-xs text-[var(--muted)]">{e.body}</p> : null}
                    <p className="text-[10px] text-[var(--muted)]">
                      {new Date(e.occurred_at).toLocaleDateString("es-ES")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        {!events?.length ? (
          <p className="text-sm text-[var(--muted)]">Tu timeline empezará a llenarse al jugar.</p>
        ) : null}
      </div>
    </section>
  );
}
