import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getMyLeagues } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { generateWrappedAction } from "@/app/actions";
import { DRINK_LABELS, type DrinkCode } from "@/lib/types";
import { BarChart, HorizontalBars, Sparkline } from "@/components/ui/bar-chart";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; year?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;
  const leagues = await getMyLeagues();

  const currentYear = new Date().getFullYear();
  const wrappedYear = Number(sp.year) || currentYear - 1;

  const supabase = await createClient();
  const sinceYear = new Date();
  sinceYear.setFullYear(sinceYear.getFullYear() - 1);

  const [
    { data: stats },
    { data: wrappedRows },
    { data: logs },
    { data: personalities },
    { data: chemistry },
    { count: gamesCount },
    { count: betsCount },
    { data: venueRows },
  ] = await Promise.all([
    supabase.from("user_stats_global").select("*").eq("user_id", profile.id).maybeSingle(),
    supabase
      .from("drink_wrapped")
      .select("*")
      .eq("user_id", profile.id)
      .order("year", { ascending: false }),
    supabase
      .from("drink_logs")
      .select("points_total, consumed_at, week_start_date, month_start_date, season_year, venue_name_snapshot")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .gte("consumed_at", sinceYear.toISOString())
      .order("consumed_at", { ascending: true })
      .limit(500),
    supabase
      .from("user_personalities")
      .select("personality_code, score, is_primary, personality_definitions(name, emoji)")
      .eq("user_id", profile.id)
      .order("score", { ascending: false })
      .limit(3),
    supabase
      .from("friendships")
      .select("chemistry_score")
      .or(`user_a.eq.${profile.id},user_b.eq.${profile.id}`)
      .order("chemistry_score", { ascending: false })
      .limit(8),
    supabase
      .from("game_sessions")
      .select("*", { count: "exact", head: true })
      .eq("created_by", profile.id),
    supabase
      .from("bets")
      .select("*", { count: "exact", head: true })
      .eq("user_id", profile.id),
    supabase
      .from("user_venues")
      .select("use_count, venues(display_name)")
      .eq("user_id", profile.id)
      .order("use_count", { ascending: false })
      .limit(6),
  ]);

  const drinkCounts = (stats?.drink_counts ?? {}) as Record<string, number>;
  const drinkBars = Object.entries(drinkCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, qty]) => ({
      label: DRINK_LABELS[code as DrinkCode] ?? code,
      value: qty,
    }));

  const venueBars = (venueRows ?? []).map((v) => {
    const venue = v.venues as unknown as { display_name: string } | null;
    return { label: venue?.display_name ?? "Lugar", value: Number(v.use_count) };
  });

  // Weekly evolution (last 8 weeks)
  const weekMap = new Map<string, number>();
  for (const log of logs ?? []) {
    const key = log.week_start_date ?? String(log.consumed_at).slice(0, 10);
    weekMap.set(key, (weekMap.get(key) ?? 0) + Number(log.points_total ?? 0));
  }
  const weekEntries = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  const weekBars = weekEntries.map(([k, v]) => ({
    label: k.slice(5),
    value: Math.round(v),
  }));
  const weekSpark = weekEntries.map(([, v]) => v);

  // Monthly
  const monthMap = new Map<string, number>();
  for (const log of logs ?? []) {
    const key = log.month_start_date ?? String(log.consumed_at).slice(0, 7);
    monthMap.set(key, (monthMap.get(key) ?? 0) + Number(log.points_total ?? 0));
  }
  const monthBars = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([k, v]) => ({ label: k.slice(5), value: Math.round(v) }));

  // Annual by season_year
  const yearMap = new Map<number, number>();
  for (const log of logs ?? []) {
    const y = Number(log.season_year ?? new Date(log.consumed_at).getFullYear());
    yearMap.set(y, (yearMap.get(y) ?? 0) + Number(log.points_total ?? 0));
  }
  const yearBars = [...yearMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, v]) => ({ label: String(y), value: Math.round(v) }));

  const chemBars = (chemistry ?? []).map((c, i) => ({
    label: `Amigo ${i + 1}`,
    value: Math.round(Number(c.chemistry_score)),
    color: "var(--teal)",
  }));

  const selectedWrapped =
    (wrappedRows ?? []).find((w) => w.year === wrappedYear) ?? (wrappedRows ?? [])[0] ?? null;
  const payload = (selectedWrapped?.payload ?? null) as Record<string, unknown> | null;

  return (
    <section className="animate-rise space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Tu legado</p>
        <h1 className="font-display text-3xl">Estadísticas</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Gráficos vivos · {leagues.length} ligas · sin tablas aburridas
        </p>
      </div>

      {sp.ok ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          DrinkWrapped generado.
        </p>
      ) : null}
      {sp.error ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <HeroStat label="Puntos" value={String(stats?.total_points ?? 0)} />
        <HeroStat label="Logs" value={String(stats?.total_logs ?? 0)} />
        <HeroStat label="Juegos" value={String(gamesCount ?? 0)} />
        <HeroStat label="Apuestas" value={String(betsCount ?? 0)} />
      </div>

      <div className="surface p-4">
        <h2 className="font-display text-xl">Evolución semanal</h2>
        <p className="text-xs text-[var(--muted)]">Puntos por semana (últimas 8)</p>
        <div className="mt-3">
          <Sparkline values={weekSpark} />
        </div>
        <div className="mt-3">
          <BarChart data={weekBars} height={120} />
        </div>
      </div>

      <div className="surface p-4">
        <h2 className="font-display text-xl">Evolución mensual</h2>
        <BarChart data={monthBars} height={130} />
      </div>

      <div className="surface p-4">
        <h2 className="font-display text-xl">Evolución anual</h2>
        <BarChart data={yearBars.length ? yearBars : [{ label: String(currentYear), value: Number(stats?.total_points ?? 0) }]} height={120} />
      </div>

      <div className="surface p-4">
        <h2 className="font-display text-xl">Bebidas favoritas</h2>
        <div className="mt-3">
          <HorizontalBars data={drinkBars} />
        </div>
      </div>

      <div className="surface p-4">
        <h2 className="font-display text-xl">Locales favoritos</h2>
        <div className="mt-3">
          <HorizontalBars
            data={
              venueBars.length
                ? venueBars
                : (logs ?? [])
                    .reduce<Array<{ label: string; value: number }>>((acc, log) => {
                      const name = log.venue_name_snapshot || "Sin lugar";
                      const hit = acc.find((a) => a.label === name);
                      if (hit) hit.value += 1;
                      else acc.push({ label: name, value: 1 });
                      return acc;
                    }, [])
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 6)
            }
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface p-4">
          <h2 className="font-display text-xl">Juegos</h2>
          <p className="mt-2 font-display text-4xl text-[var(--amber)]">{gamesCount ?? 0}</p>
          <p className="text-xs text-[var(--muted)]">partidas creadas</p>
          <Link href="/app/games" className="mt-3 inline-block text-sm text-[var(--teal)]">
            Jugar →
          </Link>
        </div>
        <div className="surface p-4">
          <h2 className="font-display text-xl">Apuestas</h2>
          <p className="mt-2 font-display text-4xl text-[var(--amber)]">{betsCount ?? 0}</p>
          <p className="text-xs text-[var(--muted)]">tickets colocados</p>
          <Link href="/app/bets" className="mt-3 inline-block text-sm text-[var(--teal)]">
            DrinkBets →
          </Link>
        </div>
      </div>

      <div className="surface p-4">
        <h2 className="font-display text-xl">Química</h2>
        <p className="text-xs text-[var(--muted)]">Top vínculos</p>
        <div className="mt-3">
          <BarChart data={chemBars} height={110} unit="%" />
        </div>
      </div>

      <div className="surface p-4">
        <h2 className="font-display text-xl">Personalidad</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(personalities ?? []).map((p) => {
            const def = p.personality_definitions as unknown as {
              name: string;
              emoji: string;
            } | null;
            return (
              <span
                key={p.personality_code}
                className={`rounded-full border px-3 py-1 text-sm ${
                  p.is_primary ? "border-[var(--amber)]" : "border-[var(--line)]"
                }`}
              >
                {def?.emoji} {def?.name ?? p.personality_code}
              </span>
            );
          })}
        </div>
      </div>

      {/* DrinkWrapped */}
      <div
        id="wrapped"
        className="overflow-hidden rounded-3xl border border-[var(--line)] p-5"
        style={{
          background:
            "linear-gradient(160deg, rgba(240,162,2,0.22), rgba(45,212,191,0.12) 55%, rgba(7,16,14,0.92))",
        }}
      >
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Resumen anual</p>
        <h2 className="font-display text-3xl">DrinkWrapped</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {[currentYear - 1, currentYear - 2, currentYear - 3]
            .filter((y) => y >= 2024)
            .map((y) => (
              <Link
                key={y}
                href={`/app/stats?year=${y}#wrapped`}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  wrappedYear === y
                    ? "bg-[var(--ink)] text-[#0b1512]"
                    : "border border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {y}
              </Link>
            ))}
        </div>
        <form action={generateWrappedAction} className="mt-4">
          <input type="hidden" name="year" value={wrappedYear} />
          <button type="submit" className="btn-primary text-sm">
            {payload ? `Regenerar ${wrappedYear}` : `Generar ${wrappedYear}`}
          </button>
        </form>
        {payload ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <HeroStat label="Puntos" value={String(payload.total_points ?? 0)} />
            <HeroStat label="Logs" value={String(payload.total_logs ?? 0)} />
            <HeroStat label="Fav bebida" value={String(payload.favorite_drink ?? "—")} />
            <HeroStat label="Fav local" value={String(payload.favorite_venue ?? "—")} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">Genera tu Wrapped {wrappedYear}.</p>
        )}
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-chip">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 truncate font-display text-2xl capitalize text-[var(--ink-strong)]">
        {value}
      </p>
    </div>
  );
}
