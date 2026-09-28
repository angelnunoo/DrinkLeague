import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { StartGameForm } from "@/components/start-game-form";
import { CasinoRoulette } from "@/components/games/casino-roulette";
import { BingoBoard } from "@/components/games/bingo-board";
import { CasinoBetsPanel } from "@/components/casino-bets-panel";

type GameStat = {
  game_type: string;
  played?: number;
  won?: number;
  lost?: number;
  blackjacks?: number;
  best_streak?: number;
  xp_earned?: number;
  tokens_wagered?: number;
  tokens_won?: number;
  tokens_lost?: number;
  biggest_win?: number;
  podiums?: number;
};

type HubMission = {
  code: string;
  title: string;
  description: string;
  emoji: string;
  target: number;
  progress: number;
  completed: boolean;
  reward_xp: number;
  reward_tokens: number;
};

type RankRow = { display_name: string; value: number };

const GAME_EMOJI: Record<string, string> = {
  blackjack: "🃏",
  carrera: "🐎",
  ruleta_casino: "🎡",
  bingo: "🎱",
};

export default async function CasinoPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    tab?: string;
    league?: string;
    placed?: string;
    boost?: string;
    settled?: string;
  }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;
  const tab = sp.tab === "apuestas" ? "apuestas" : "juegos";
  const supabase = await createClient();

  const [
    { data: hub },
    { data: friendships },
    { data: recent },
    { data: liveWins },
    { data: bigPrizes },
    { data: hotStreaks },
  ] = await Promise.all([
    supabase.rpc("get_casino_hub"),
    supabase
      .from("friendships")
      .select("user_a, user_b")
      .or(`user_a.eq.${profile.id},user_b.eq.${profile.id}`)
      .limit(40),
    supabase
      .from("game_sessions")
      .select("id, game_type, status, created_at")
      .eq("created_by", profile.id)
      .in("game_type", ["blackjack", "carrera", "ruleta_casino", "bingo"])
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("game_wagers")
      .select("game_type, payout, net, result, created_at, user_id")
      .eq("result", "win")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("game_wagers")
      .select("game_type, payout, net, user_id, created_at")
      .gt("net", 0)
      .order("net", { ascending: false })
      .limit(5),
    supabase
      .from("user_game_stats")
      .select("user_id, game_type, best_streak, current_streak")
      .in("game_type", ["blackjack", "carrera", "ruleta_casino", "bingo"])
      .gt("best_streak", 1)
      .order("best_streak", { ascending: false })
      .limit(5),
  ]);

  const friendIds = [
    ...new Set(
      (friendships ?? [])
        .flatMap((f) => [f.user_a, f.user_b])
        .filter((id) => id !== profile.id),
    ),
  ];
  const liveUserIds = [
    ...new Set([
      ...(liveWins ?? []).map((w) => w.user_id),
      ...(bigPrizes ?? []).map((w) => w.user_id),
      ...(hotStreaks ?? []).map((w) => w.user_id),
    ]),
  ];
  const nameIds = [...new Set([...friendIds, ...liveUserIds])];
  const { data: nameUsers } = nameIds.length
    ? await supabase.from("users").select("id, display_name, friend_code").in("id", nameIds)
    : { data: [] };
  const nameMap = new Map((nameUsers ?? []).map((u) => [u.id, u.display_name]));
  const friendUsers = (nameUsers ?? []).filter((u) => friendIds.includes(u.id));

  const hubData = (hub ?? {}) as {
    stats?: GameStat[];
    missions?: HubMission[];
    rankings?: {
      top_winnings?: RankRow[];
      top_bj?: RankRow[];
      top_carrera?: RankRow[];
      top_bingo?: RankRow[];
    };
  };

  const stats = hubData.stats ?? [];
  const byType = new Map(stats.map((s) => [s.game_type, s]));
  const tokensWon = stats.reduce((a, s) => a + Number(s.tokens_won ?? 0), 0);
  const tokensLost = stats.reduce((a, s) => a + Number(s.tokens_lost ?? 0), 0);
  const net = tokensWon - tokensLost;
  const bestStreak = Math.max(0, ...stats.map((s) => Number(s.best_streak ?? 0)));
  const bestPrize = Math.max(
    0,
    ...stats.map((s) => Number(s.biggest_win ?? s.tokens_won ?? 0)),
  );
  const bjWins = Number(byType.get("blackjack")?.won ?? 0);
  const bjNaturals = Number(byType.get("blackjack")?.blackjacks ?? 0);
  const carreraWins = Number(byType.get("carrera")?.won ?? 0);
  const bingoWins = Number(byType.get("bingo")?.won ?? 0);
  const ruletaWins = Number(byType.get("ruleta_casino")?.won ?? 0);
  const tokens = Number(profile.token_balance ?? 0);
  const activeMissions = (hubData.missions ?? []).filter((m) => !m.completed).slice(0, 3);

  const gameLabel: Record<string, string> = {
    blackjack: "BlackJack",
    carrera: "Carrera",
    ruleta_casino: "Ruleta",
    bingo: "Bingo",
  };

  return (
    <section className="animate-rise space-y-6">
      <div className="casino-hero overflow-hidden rounded-3xl border border-[var(--line)] p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--amber)]">
          Premium · Vivo
        </p>
        <h1 className="font-display text-4xl text-[var(--ink-strong)]">DrinkCasino</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Fichas · riesgo · recompensas
        </p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase text-[var(--muted)]">Saldo</p>
            <p className="font-display text-4xl text-[var(--amber)]">
              {tokens.toLocaleString("es-ES")} ★
            </p>
          </div>
          <Link href="/app/shop" className="btn-ghost min-h-11 text-xs">
            🛒 Tienda
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/app/casino"
          className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
            tab === "juegos"
              ? "border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_14%,transparent)]"
              : "border-[var(--line)]"
          }`}
        >
          🎰 Juegos
        </Link>
        <Link
          href="/app/casino?tab=apuestas"
          className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
            tab === "apuestas"
              ? "border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_14%,transparent)]"
              : "border-[var(--line)]"
          }`}
        >
          💰 Apuestas
        </Link>
      </div>

      {/* Live feed */}
      <div className="surface space-y-3 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
          🔥 Casino en vivo
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] uppercase text-[var(--muted)]">Últimos ganadores</p>
            <ul className="space-y-1 text-sm">
              {(liveWins ?? []).slice(0, 4).map((w, i) => (
                <li key={`lw-${i}`} className="flex justify-between gap-2">
                  <span className="truncate">
                    {GAME_EMOJI[w.game_type] ?? "★"} {nameMap.get(w.user_id) ?? "Jugador"}
                  </span>
                  <span className="text-[var(--teal)]">+{Number(w.net)}</span>
                </li>
              ))}
              {!liveWins?.length ? (
                <li className="text-xs text-[var(--muted)]">Sé el primero en ganar</li>
              ) : null}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase text-[var(--muted)]">Mayores premios</p>
            <ul className="space-y-1 text-sm">
              {(bigPrizes ?? []).slice(0, 4).map((w, i) => (
                <li key={`bp-${i}`} className="flex justify-between gap-2">
                  <span className="truncate">
                    {GAME_EMOJI[w.game_type] ?? "★"} {nameMap.get(w.user_id) ?? "Jugador"}
                  </span>
                  <span className="text-[var(--amber)]">{Number(w.net)} ★</span>
                </li>
              ))}
              {!bigPrizes?.length ? (
                <li className="text-xs text-[var(--muted)]">Aún sin jackpots</li>
              ) : null}
            </ul>
          </div>
        </div>
        {(hotStreaks ?? []).length ? (
          <div>
            <p className="mb-1 text-[10px] uppercase text-[var(--muted)]">Rachas destacadas</p>
            <div className="flex flex-wrap gap-2">
              {(hotStreaks ?? []).slice(0, 4).map((s, i) => (
                <span
                  key={`hs-${i}`}
                  className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px]"
                >
                  🔥 {nameMap.get(s.user_id) ?? "?"} · {s.best_streak}{" "}
                  {gameLabel[s.game_type] ?? s.game_type}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {activeMissions.length ? (
          <div>
            <p className="mb-1 text-[10px] uppercase text-[var(--muted)]">Misiones activas</p>
            <ul className="space-y-1 text-sm">
              {activeMissions.map((m) => (
                <li key={m.code}>
                  {m.emoji} {m.title} · {m.progress}/{m.target}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {tab === "apuestas" ? (
        <CasinoBetsPanel
          profileId={profile.id}
          leagueId={sp.league}
          flash={{
            placed: sp.placed,
            boost: sp.boost,
            settled: sp.settled,
            error: sp.error,
          }}
        />
      ) : (
        <>
          {sp.error ? (
            <p className="rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">
              {decodeURIComponent(sp.error)}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="stat-chip p-3 text-center">
              <p className="text-[9px] text-[var(--muted)]">Ganadas</p>
              <p className="font-display text-xl text-[var(--teal)]">
                +{tokensWon.toLocaleString("es-ES")}
              </p>
            </div>
            <div className="stat-chip p-3 text-center">
              <p className="text-[9px] text-[var(--muted)]">Perdidas</p>
              <p className="font-display text-xl text-[var(--danger)]">
                −{tokensLost.toLocaleString("es-ES")}
              </p>
            </div>
            <div className="stat-chip p-3 text-center">
              <p className="text-[9px] text-[var(--muted)]">Beneficio neto</p>
              <p
                className={`font-display text-xl ${
                  net >= 0 ? "text-[var(--teal)]" : "text-[var(--danger)]"
                }`}
              >
                {net >= 0 ? "+" : ""}
                {net.toLocaleString("es-ES")}
              </p>
            </div>
            <div className="stat-chip p-3 text-center">
              <p className="text-[9px] text-[var(--muted)]">Mayor premio</p>
              <p className="font-display text-xl text-[var(--amber)]">{bestPrize}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="stat-chip p-2 text-center">
              <p className="text-[9px] text-[var(--muted)]">Racha</p>
              <p className="font-display text-lg">🔥 {bestStreak}</p>
            </div>
            <div className="stat-chip p-2 text-center">
              <p className="text-[9px] text-[var(--muted)]">BJ</p>
              <p className="font-display text-lg">
                {bjWins}
                <span className="text-xs text-[var(--muted)]">/{bjNaturals}🃏</span>
              </p>
            </div>
            <div className="stat-chip p-2 text-center">
              <p className="text-[9px] text-[var(--muted)]">Carreras</p>
              <p className="font-display text-lg">🐎 {carreraWins}</p>
            </div>
            <div className="stat-chip p-2 text-center">
              <p className="text-[9px] text-[var(--muted)]">Bingos</p>
              <p className="font-display text-lg">🎱 {bingoWins}</p>
            </div>
            <div className="stat-chip p-2 text-center sm:col-span-1 col-span-2">
              <p className="text-[9px] text-[var(--muted)]">Ruletas</p>
              <p className="font-display text-lg">🎡 {ruletaWins}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <Link
              href="/app/casino?tab=apuestas"
              className="game-card game-card-ruleta-casino block !pb-5"
            >
              <p className="absolute right-4 top-4 text-4xl opacity-90" aria-hidden>
                💰
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
                DrinkCasino
              </p>
              <h2 className="font-display text-3xl">Apuestas</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Campeones, MVP, récords, química y eventos de liga.
              </p>
              <span className="btn-primary mt-4 inline-flex min-h-12 px-6">Abrir mercados</span>
            </Link>

            <StartGameForm
              gameType="blackjack"
              label="BlackJack"
              blurb="Apuesta fichas. Gana ×2, BlackJack ×2.5, empate recuperas."
              tokenBalance={tokens}
            />
            <StartGameForm
              gameType="carrera"
              label="Carrera de Caballos"
              blurb="2–4 jinetes. Apuesta al bote. El primero en meta se lo lleva."
              friends={friendUsers}
              meName={profile.display_name}
              meId={profile.id}
              tokenBalance={tokens}
            />
            <CasinoRoulette tokenBalance={tokens} />
            <BingoBoard
              tokenBalance={tokens}
              friends={friendUsers}
              meName={profile.display_name}
              meId={profile.id}
            />
          </div>

          <div className="surface space-y-3 p-5">
            <h2 className="font-display text-xl">🎯 Misiones Casino</h2>
            <ul className="space-y-2">
              {(hubData.missions ?? []).map((m) => (
                <li key={m.code} className="rank-row space-y-2 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">
                      {m.emoji} {m.title}
                    </p>
                    <span className="text-xs text-[var(--amber)]">
                      +{m.reward_xp} XP · +{m.reward_tokens} ★
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted)]">{m.description}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                    <div
                      className="h-full rounded-full bg-[var(--teal)]"
                      style={{
                        width: `${Math.min(100, (m.progress / Math.max(1, m.target)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--muted)]">
                    {m.progress}/{m.target}
                    {m.completed ? " · ✅ Completada" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="surface space-y-4 p-5">
            <h2 className="font-display text-xl">🏆 Rankings Casino</h2>
            {(
              [
                ["top_winnings", "Más fichas ganadas", "💰"],
                ["top_bj", "Mejor jugador BlackJack", "🃏"],
                ["top_carrera", "Rey del Hipódromo", "🐎"],
                ["top_bingo", "Rey del Bingo", "🎱"],
              ] as const
            ).map(([key, title, emoji]) => (
              <div key={key}>
                <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  {emoji} {title}
                </p>
                <ol className="mt-2 space-y-1">
                  {(hubData.rankings?.[key] ?? []).slice(0, 5).map((row, i) => (
                    <li
                      key={`${key}-${row.display_name}-${i}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>
                        {i + 1}. {row.display_name}
                      </span>
                      <span className="font-display text-[var(--amber)]">{Number(row.value)}</span>
                    </li>
                  ))}
                  {!hubData.rankings?.[key]?.length ? (
                    <li className="text-xs text-[var(--muted)]">Aún vacío</li>
                  ) : null}
                </ol>
              </div>
            ))}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                🎡 Maestro de la Ruleta
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Tus victorias · {ruletaWins}
              </p>
            </div>
            <p className="text-center text-xs text-[var(--muted)]">
              🎰 Leyenda del Casino · gana 100 partidas
            </p>
          </div>

          <div className="surface p-5">
            <h2 className="font-display text-xl">Historial casino</h2>
            <ul className="mt-3 space-y-2">
              {(recent ?? []).map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/app/games/play?id=${encodeURIComponent(g.id)}`}
                    className="rank-row flex min-h-12 items-center justify-between px-4 py-3"
                  >
                    <span className="font-semibold">{gameLabel[g.game_type] ?? g.game_type}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {new Date(g.created_at).toLocaleDateString("es-ES")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Link href="/app/games" className="btn-ghost min-h-12 w-full text-center text-sm">
        ← Juegos sociales
      </Link>
    </section>
  );
}
