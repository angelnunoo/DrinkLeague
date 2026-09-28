import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { StartGameForm } from "@/components/start-game-form";
import { CasinoRoulette } from "@/components/games/casino-roulette";
import { BingoBoard } from "@/components/games/bingo-board";

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

export default async function CasinoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: hub }, { data: friendships }, { data: recent }] = await Promise.all([
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
      .limit(10),
  ]);

  const friendIds = [
    ...new Set(
      (friendships ?? [])
        .flatMap((f) => [f.user_a, f.user_b])
        .filter((id) => id !== profile.id),
    ),
  ];
  const { data: friendUsers } = friendIds.length
    ? await supabase
        .from("users")
        .select("id, display_name, friend_code")
        .in("id", friendIds)
        .order("display_name")
    : { data: [] };

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
  const bestStreak = Math.max(0, ...stats.map((s) => Number(s.best_streak ?? 0)));
  const bestPrize = Math.max(0, ...stats.map((s) => Number(s.tokens_won ?? 0)));
  const bestGame =
    [...stats].sort((a, b) => Number(b.won ?? 0) - Number(a.won ?? 0))[0]?.game_type ?? "—";
  const carreraWins = Number(byType.get("carrera")?.won ?? 0);
  const bingoWins = Number(byType.get("bingo")?.won ?? 0);
  const tokens = Number(profile.token_balance ?? 0);

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
          Premium · Fichas
        </p>
        <h1 className="font-display text-4xl text-[var(--ink-strong)]">DrinkCasino</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          BlackJack · Caballos · Ruleta · Bingo · {tokens.toLocaleString("es-ES")} ★
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
            <p className="text-[9px] text-[var(--muted)]">Mayor premio</p>
            <p className="font-display text-xl text-[var(--amber)]">{bestPrize}</p>
          </div>
          <div className="stat-chip p-3 text-center">
            <p className="text-[9px] text-[var(--muted)]">Mejor racha</p>
            <p className="font-display text-xl">🔥 {bestStreak}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Mejor juego · {gameLabel[bestGame] ?? bestGame} · 🐎 {carreraWins} · 🎱 {bingoWins}
        </p>
      </div>

      {sp.error ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}

      <div className="grid gap-4">
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
          friends={friendUsers ?? []}
          meName={profile.display_name}
          meId={profile.id}
          tokenBalance={tokens}
        />
        <CasinoRoulette tokenBalance={tokens} />
        <BingoBoard
          tokenBalance={tokens}
          friends={friendUsers ?? []}
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
          {!hubData.missions?.length ? (
            <li className="text-sm text-[var(--muted)]">Juega para desbloquear misiones.</li>
          ) : null}
        </ul>
      </div>

      <div className="surface space-y-4 p-5">
        <h2 className="font-display text-xl">🏆 Rankings Casino</h2>
        {(
          [
            ["top_winnings", "Más fichas ganadas", "💰"],
            ["top_bj", "Mejor jugador BlackJack", "🃏"],
            ["top_carrera", "Mejor jinete", "🐎"],
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
                className="rank-row flex min-h-12 items-center justify-between px-4 py-3 transition hover:border-[var(--amber)]"
              >
                <span className="font-semibold">{gameLabel[g.game_type] ?? g.game_type}</span>
                <span className="text-xs text-[var(--muted)]">
                  {g.status === "finished" ? "Terminada" : "En curso"} ·{" "}
                  {new Date(g.created_at).toLocaleDateString("es-ES")}
                </span>
              </Link>
            </li>
          ))}
          {!recent?.length ? (
            <li className="text-sm text-[var(--muted)]">Aún no hay partidas de casino.</li>
          ) : null}
        </ul>
      </div>

      <Link href="/app/games" className="btn-ghost min-h-12 w-full text-center text-sm">
        ← Juegos sociales (Peaje · Rey · Duelo · Ruleta)
      </Link>
    </section>
  );
}
