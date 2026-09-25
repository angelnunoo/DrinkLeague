import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getMyLeagues } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function MuseumPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const leagues = await getMyLeagues();
  const supabase = await createClient();
  const leagueId = leagues[0]?.id;

  const [{ data: globalRecords }, { data: leagueRecords }, { data: medals }] = await Promise.all([
    supabase.from("global_records").select("*").order("value", { ascending: false }),
    leagueId
      ? supabase
          .from("league_records")
          .select("*")
          .eq("league_id", leagueId)
          .order("value", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("user_medals")
      .select("place")
      .eq("user_id", profile.id),
  ]);

  // Enrich museum highlights from aggregates
  const [
    { data: topNight },
    { data: topChem },
    { data: topMvp },
    { data: topBeer },
    { data: topBets },
    { data: topDuels },
    { data: topSeasons },
  ] = await Promise.all([
    supabase
      .from("drink_logs")
      .select("points_total, user_id, consumed_at")
      .eq("status", "active")
      .order("points_total", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("friendships")
      .select("chemistry_score, user_a, user_b")
      .order("chemistry_score", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("mvp_awards")
      .select("user_id")
      .limit(200),
    supabase.from("user_stats_global").select("user_id, drink_counts, total_points").limit(200),
    supabase.from("bets").select("user_id, status").eq("status", "won").limit(500),
    supabase
      .from("game_sessions")
      .select("created_by")
      .eq("game_type", "duelo")
      .eq("status", "finished")
      .limit(500),
    supabase
      .from("season_albums")
      .select("user_id")
      .eq("final_position", 1)
      .limit(200),
  ]);

  const mvpCounts = countBy((topMvp ?? []).map((m) => m.user_id));
  const beerCounts = new Map<string, number>();
  for (const s of topBeer ?? []) {
    const dc = (s.drink_counts ?? {}) as Record<string, number>;
    beerCounts.set(s.user_id, Number(dc.cerveza ?? 0));
  }
  const betCounts = countBy((topBets ?? []).map((b) => b.user_id));
  const duelCounts = countBy((topDuels ?? []).map((d) => d.created_by));
  const seasonCounts = countBy((topSeasons ?? []).map((s) => s.user_id));

  const holderIds = [
    topNight?.user_id,
    topChem?.user_a,
    topChem?.user_b,
    maxKey(mvpCounts),
    maxKey(beerCounts),
    maxKey(betCounts),
    maxKey(duelCounts),
    maxKey(seasonCounts),
    ...(globalRecords ?? []).map((r) => r.holder_user_id),
    ...(leagueRecords ?? []).map((r) => r.holder_user_id),
  ].filter(Boolean) as string[];

  const { data: users } = holderIds.length
    ? await supabase.from("users").select("id, display_name").in("id", [...new Set(holderIds)])
    : { data: [] };
  const uname = new Map((users ?? []).map((u) => [u.id, u.display_name]));

  const myGold = (medals ?? []).filter((m) => m.place === 1).length;
  const mySilver = (medals ?? []).filter((m) => m.place === 2).length;
  const myBronze = (medals ?? []).filter((m) => m.place === 3).length;

  const highlights = [
    {
      title: "Mayor puntuación de una noche",
      value: topNight ? String(topNight.points_total) : "—",
      holder: topNight ? uname.get(topNight.user_id) : null,
    },
    {
      title: "Mayor química conseguida",
      value: topChem ? `${Math.round(Number(topChem.chemistry_score))}%` : "—",
      holder: topChem
        ? `${uname.get(topChem.user_a) ?? "?"} + ${uname.get(topChem.user_b) ?? "?"}`
        : null,
    },
    {
      title: "Más MVP",
      value: String(mvpCounts.get(maxKey(mvpCounts) ?? "") ?? 0),
      holder: uname.get(maxKey(mvpCounts) ?? ""),
    },
    {
      title: "Más cervezas",
      value: String(beerCounts.get(maxKey(beerCounts) ?? "") ?? 0),
      holder: uname.get(maxKey(beerCounts) ?? ""),
    },
    {
      title: "Más apuestas ganadas",
      value: String(betCounts.get(maxKey(betCounts) ?? "") ?? 0),
      holder: uname.get(maxKey(betCounts) ?? ""),
    },
    {
      title: "Más duelos ganados",
      value: String(duelCounts.get(maxKey(duelCounts) ?? "") ?? 0),
      holder: uname.get(maxKey(duelCounts) ?? ""),
    },
    {
      title: "Más temporadas ganadas",
      value: String(seasonCounts.get(maxKey(seasonCounts) ?? "") ?? 0),
      holder: uname.get(maxKey(seasonCounts) ?? ""),
    },
  ];

  return (
    <section className="animate-rise space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Historia</p>
        <h1 className="font-display text-3xl">Museo DrinkLeague</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Récords globales y de liga · legado eterno
        </p>
      </div>

      <div className="home-hero">
        <p className="text-[10px] uppercase text-[var(--muted)]">Tus medallas</p>
        <div className="mt-2 flex gap-4 font-display text-2xl">
          <span>🥇 {myGold}</span>
          <span>🥈 {mySilver}</span>
          <span>🥉 {myBronze}</span>
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl">Nivel Global</h2>
        <div className="mt-3 grid gap-2">
          {highlights.map((h) => (
            <div key={h.title} className="premium-banner !animate-none p-4">
              <p className="text-xs text-[var(--gold)]">🏆 {h.title}</p>
              <p className="mt-1 font-display text-3xl text-[var(--ink-strong)]">{h.value}</p>
              <p className="text-sm text-[var(--muted)]">{h.holder ?? "Sin titular"}</p>
            </div>
          ))}
        </div>
      </div>

      {leagueId ? (
        <div>
          <h2 className="font-display text-xl">Nivel Liga · {leagues[0]?.name}</h2>
          <ul className="mt-3 space-y-2">
            {(leagueRecords ?? []).map((r) => (
              <li key={r.id} className="rank-row flex justify-between px-3 py-3 text-sm">
                <span>{r.label}</span>
                <span className="font-display text-[var(--amber)]">
                  {Number(r.value)} · {uname.get(r.holder_user_id) ?? "?"}
                </span>
              </li>
            ))}
            {!leagueRecords?.length ? (
              <li className="text-sm text-[var(--muted)]">Aún no hay récords de liga.</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div>
        <h2 className="font-display text-xl">Archivo global</h2>
        <ul className="mt-3 space-y-2">
          {(globalRecords ?? []).map((r) => (
            <li key={r.record_code} className="rank-row flex justify-between px-3 py-3 text-sm">
              <span>{r.label}</span>
              <span className="font-display text-[var(--amber)]">
                {Number(r.value)} · {uname.get(r.holder_user_id) ?? "?"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Link href="/app" className="text-sm text-[var(--muted)]">
        ← Inicio
      </Link>
    </section>
  );
}

function countBy(ids: string[]) {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

function maxKey(m: Map<string, number>) {
  let best: string | null = null;
  let bestV = -1;
  for (const [k, v] of m) {
    if (v > bestV) {
      best = k;
      bestV = v;
    }
  }
  return best;
}
