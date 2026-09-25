import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getMyLeagues } from "@/lib/data";
import { LogDrinksForm } from "@/components/log-drinks-form";
import { createClient } from "@/lib/supabase/server";
import { xpProgress } from "@/lib/domain";
import { XpBar } from "@/components/ui/xp-bar";
import { ensureWeeklyMarketAction } from "@/app/actions";
import { RivalCard } from "@/components/ui/rival-card";
import { StreakStrip } from "@/components/ui/streak-strip";

export default async function AppHomePage() {
  const [profile, leagues] = await Promise.all([getCurrentProfile(), getMyLeagues()]);
  if (!profile) redirect("/login");

  const progress = xpProgress(Number(profile.xp));
  const supabase = await createClient();
  const primaryLeague = leagues[0];

  // Refresh streaks / rivals / objectives lightly
  await supabase.rpc("refresh_legacy_hub", {
    p_league_id: primaryLeague?.id ?? null,
  });
  const { flushRecentPushes } = await import("@/lib/notifications");
  void flushRecentPushes(profile.id).catch(() => undefined);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 14);

  const [
    { data: opens },
    { data: challenges },
    { data: boosts },
    leaderboard,
    { data: streakRows },
    { data: rivalRow },
  ] = await Promise.all([
    supabase
      .from("app_opens")
      .select("day")
      .eq("user_id", profile.id)
      .gte("day", weekAgo.toISOString().slice(0, 10))
      .order("day", { ascending: false }),
    supabase
      .from("challenges")
      .select("id, mode, status, ends_at, stake_points")
      .in("status", ["open", "active", "pending", "accepted"])
      .order("ends_at", { ascending: true })
      .limit(3),
    primaryLeague
      ? supabase
          .from("super_boosts")
          .select("id, boosted_odds, ends_at, selection_id")
          .gt("ends_at", new Date().toISOString())
          .order("ends_at", { ascending: true })
          .limit(5)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            boosted_odds: number;
            ends_at: string;
            selection_id: string;
          }>,
        }),
    primaryLeague ? fetchQuickBoard(supabase, primaryLeague.id, profile.id) : Promise.resolve(null),
    supabase.from("user_streaks").select("streak_type, current_count").eq("user_id", profile.id),
    primaryLeague
      ? supabase
          .from("user_rivals")
          .select("*")
          .eq("user_id", profile.id)
          .eq("league_id", primaryLeague.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const streak = computeStreak((opens ?? []).map((o) => o.day));

  let rivalName: string | null = null;
  if (rivalRow?.rival_user_id) {
    const { data: ru } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", rivalRow.rival_user_id)
      .maybeSingle();
    rivalName = ru?.display_name ?? null;
  }

  const activeBoost = (boosts ?? [])[0] ?? null;
  let boostLabel = "Selección premium";
  let boostMarketTitle: string | null = null;
  if (activeBoost?.selection_id) {
    const { data: sel } = await supabase
      .from("bet_selections")
      .select("label, bet_markets(title)")
      .eq("id", activeBoost.selection_id)
      .maybeSingle();
    if (sel?.label) boostLabel = sel.label;
    const market = sel?.bet_markets as unknown as { title: string } | null;
    boostMarketTitle = market?.title ?? null;
  }

  const weeklyChallenge = (challenges ?? [])[0];

  return (
    <section className="animate-rise space-y-5 pb-4">
      {/* Hero status */}
      <div className="home-hero">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
              Temporada en curso
            </p>
            <h1 className="font-display text-3xl text-[var(--ink-strong)]">
              Hola, {profile.display_name.split(" ")[0]}
            </h1>
            <p className="mt-0.5 text-sm text-[var(--amber)]">
              {profile.title ?? "Novato"} · Nv.{progress.level}
              {profile.prestige_level
                ? ` · 👑 Prestigio ${roman(profile.prestige_level)}`
                : ""}
            </p>
          </div>
          <Link
            href="/app/shop"
            className="shrink-0 rounded-2xl border border-[var(--line)] bg-[rgba(7,16,14,0.55)] px-3 py-2 text-right"
          >
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Fichas</p>
            <p className="font-display text-xl text-[var(--amber)]">
              {Number(profile.token_balance ?? 0).toLocaleString("es-ES")}
            </p>
          </Link>
        </div>

        <div className="mt-4">
          <XpBar
            ratio={progress.ratio}
            size="lg"
            accent="amber"
            label={`${progress.current} → ${progress.next} XP`}
          />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatMini label="Nivel" value={String(progress.level)} />
          <StatMini label="Racha" value={`${streak}d`} accent />
          <StatMini
            label="Posición"
            value={leaderboard?.myRank ? `#${leaderboard.myRank}` : "—"}
          />
        </div>
      </div>

      <StreakStrip streaks={streakRows ?? []} />

      <RivalCard
        rival={
          rivalRow && rivalName
            ? {
                rival_name: rivalName,
                points_delta: Number(rivalRow.points_delta),
                seasons_me: Number(rivalRow.seasons_me),
                seasons_rival: Number(rivalRow.seasons_rival),
                duels_me: Number(rivalRow.duels_me),
                duels_rival: Number(rivalRow.duels_rival),
                my_rank: rivalRow.my_rank,
                rival_rank: rivalRow.rival_rank,
              }
            : null
        }
      />

      {/* Mega CTA + log */}
      <div className="surface overflow-hidden p-4 sm:p-5">
        <a href="#registrar" className="mega-cta animate-pop mb-4">
          <span aria-hidden>🍺</span>
          Registrar bebida
        </a>
        <div id="registrar">
          <LogDrinksForm mega />
        </div>
      </div>

      {/* SuperAumento destacado */}
      {activeBoost ? (
        <Link href={`/app/bets${primaryLeague ? `?league=${primaryLeague.id}` : ""}`} className="premium-banner block p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
            SuperAumento activo
          </p>
          <p className="mt-1 font-display text-2xl text-[var(--ink-strong)]">
            {boostLabel}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {boostMarketTitle ?? "DrinkBets"} · cuota{" "}
            <span className="font-display text-[var(--amber)]">
              {Number(activeBoost.boosted_odds).toFixed(2)}
            </span>
          </p>
          <p className="mt-2 text-xs text-[var(--gold)]">
            Expira {new Date(activeBoost.ends_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </Link>
      ) : primaryLeague ? (
        <form action={ensureWeeklyMarketAction.bind(null, primaryLeague.id)}>
          <button type="submit" className="premium-banner w-full p-4 text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
              DrinkBets
            </p>
            <p className="mt-1 font-display text-xl">Mercados listos para apostar</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Tocá para generar 10–20 apuestas de {primaryLeague.name}
            </p>
          </button>
        </form>
      ) : null}

      {/* Evento / reto */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="stat-chip">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Evento activo</p>
          <p className="mt-1 font-display text-lg">
            {weeklyChallenge
              ? `Reto ${weeklyChallenge.mode} · ${weeklyChallenge.stake_points ?? 0} pts`
              : primaryLeague
                ? primaryLeague.name
                : "Únete a una liga"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {weeklyChallenge
              ? `Hasta ${new Date(weeklyChallenge.ends_at).toLocaleDateString("es-ES")}`
              : "Crea o entra en una liga para eventos"}
          </p>
        </div>
        <Link href="/app/challenges" className="stat-chip transition hover:border-[var(--teal)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Reto semanal</p>
          <p className="mt-1 font-display text-lg">
            {weeklyChallenge ? "En juego" : "Sin reto · crear"}
          </p>
          <p className="mt-1 text-xs text-[var(--teal)]">Ver retos →</p>
        </Link>
      </div>

      {/* Clasificación rápida */}
      {leaderboard && primaryLeague ? (
        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                Clasificación rápida
              </p>
              <h2 className="font-display text-xl">{primaryLeague.name}</h2>
            </div>
            <Link
              href={`/app/leagues/${primaryLeague.id}`}
              className="text-xs font-semibold text-[var(--teal)]"
            >
              Ver todo
            </Link>
          </div>
          <ol className="space-y-2">
            {leaderboard.top.map((row, i) => (
              <li
                key={row.user_id}
                className={`rank-row flex items-center gap-3 px-3 py-2.5 ${
                  row.user_id === profile.id ? "rank-row-me" : ""
                }`}
              >
                <span className="font-display w-6 text-center text-[var(--muted)]">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{row.display_name}</span>
                <span className="font-display text-[var(--amber)]">{row.points}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <Link href="/app/leagues/new" className="surface block p-5 text-center">
          <p className="font-display text-xl">Crea tu primera liga</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Sin liga no hay ranking ni apuestas</p>
        </Link>
      )}

      {/* Quick modules — visual tiles, not empty admin grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { href: "/app/battle-pass", title: "Pase", sub: "Recompensas" },
          { href: "/app/objectives", title: "Objetivos", sub: "Misiones" },
          { href: "/app/games", title: "Juegos", sub: "Peaje · Rey · Duelo" },
          { href: "/app/bets", title: "DrinkBets", sub: "Apuestas vivas" },
          { href: "/app/achievements", title: "Logros", sub: "Secretos" },
          { href: "/app/album", title: "Álbum", sub: "Temporadas" },
          { href: "/app/activity", title: "Actividad", sub: "Notificaciones" },
          { href: "/app/museum", title: "Museo", sub: "Récords" },
          { href: "/app/stats", title: "Stats", sub: "Gráficos" },
          { href: "/app/social", title: "Social", sub: "Química" },
          { href: "/app/profile", title: "Perfil", sub: "Vitrina" },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="surface p-3.5 transition active:scale-[0.98] hover:border-[var(--teal)]"
          >
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{t.sub}</p>
            <p className="font-display text-xl">{t.title}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function roman(n: number) {
  const map = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return map[Math.min(n, 10)] ?? String(n);
}

function StatMini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="stat-chip text-center">
      <p className="text-[9px] uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p
        className={`font-display text-2xl ${accent ? "text-[var(--teal)]" : "text-[var(--ink-strong)]"}`}
      >
        {value}
      </p>
    </div>
  );
}

function computeStreak(daysDesc: string[]): number {
  if (!daysDesc.length) return 0;
  const set = new Set(daysDesc);
  let streak = 0;
  const cursor = new Date();
  // Allow today or yesterday as start
  const today = cursor.toISOString().slice(0, 10);
  const y = new Date(cursor);
  y.setDate(y.getDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  if (!set.has(today) && !set.has(yesterday)) return 0;
  if (!set.has(today)) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!set.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function fetchQuickBoard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leagueId: string,
  meId: string,
) {
  const week = new Date();
  // Approximate ISO week start Monday in local — RPC uses Madrid; use latest week rows
  const { data } = await supabase
    .from("leaderboard_weekly")
    .select("user_id, points, week_start_date")
    .eq("league_id", leagueId)
    .order("week_start_date", { ascending: false })
    .limit(40);

  if (!data?.length) return { top: [] as Array<{ user_id: string; display_name: string; points: number }>, myRank: null as number | null };

  const latest = data[0].week_start_date;
  const rows = data
    .filter((r) => r.week_start_date === latest)
    .sort((a, b) => Number(b.points) - Number(a.points));

  const uids = rows.slice(0, 5).map((r) => r.user_id);
  if (!uids.includes(meId) && rows.some((r) => r.user_id === meId)) {
    uids.push(meId);
  }
  const { data: users } = await supabase
    .from("users")
    .select("id, display_name")
    .in("id", [...new Set(uids)]);
  const umap = new Map((users ?? []).map((u) => [u.id, u.display_name]));

  const myIdx = rows.findIndex((r) => r.user_id === meId);

  return {
    top: rows.slice(0, 5).map((r) => ({
      user_id: r.user_id,
      display_name: umap.get(r.user_id) ?? "?",
      points: Number(r.points),
    })),
    myRank: myIdx >= 0 ? myIdx + 1 : null,
  };
}
