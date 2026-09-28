import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { StartGameForm } from "@/components/start-game-form";

type GameStat = {
  game_type: string;
  played?: number;
  won?: number;
  lost?: number;
  draws?: number;
  blackjacks?: number;
  best_streak?: number;
  xp_earned?: number;
  tokens_earned?: number;
  tokens_wagered?: number;
  tokens_won?: number;
  tokens_lost?: number;
  podiums?: number;
  kings_found?: number;
};

const GAME_LABELS: Record<string, string> = {
  peaje: "Peaje",
  rey: "Rey",
  duelo: "Duelo",
  blackjack: "BlackJack",
  carrera: "Carrera",
};

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;

  const supabase = await createClient();
  const [
    { data: recent },
    { data: gameStats },
    { data: friendships },
  ] = await Promise.all([
    supabase
      .from("game_sessions")
      .select("id, game_type, status, created_at, state")
      .eq("created_by", profile.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("user_game_stats").select("*").eq("user_id", profile.id),
    supabase
      .from("friendships")
      .select("user_a, user_b")
      .or(`user_a.eq.${profile.id},user_b.eq.${profile.id}`)
      .limit(40),
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

  const statsMap = new Map(
    ((gameStats ?? []) as GameStat[]).map((s) => [s.game_type, s]),
  );
  const tokens = Number(profile.token_balance ?? 0);

  return (
    <section className="animate-rise space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Casino · Hipódromo
        </p>
        <h1 className="font-display text-3xl">Juegos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Riesgo y recompensa · {tokens.toLocaleString("es-ES")} ★ disponibles
        </p>
      </div>

      {sp.error ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(["carrera", "blackjack", "peaje", "rey", "duelo"] as const).map((g) => {
          const s = statsMap.get(g);
          return (
            <div key={g} className="surface space-y-2 p-4">
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {GAME_LABELS[g] ?? g}
              </p>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="font-display text-xl">{s?.played ?? 0}</p>
                  <p className="text-[9px] text-[var(--muted)]">Jugadas</p>
                </div>
                <div>
                  <p className="font-display text-xl text-[var(--teal)]">{s?.won ?? 0}</p>
                  <p className="text-[9px] text-[var(--muted)]">Ganadas</p>
                </div>
                <div>
                  <p className="font-display text-xl text-[var(--danger)]">{s?.lost ?? 0}</p>
                  <p className="text-[9px] text-[var(--muted)]">Perdidas</p>
                </div>
                <div>
                  <p className="font-display text-xl text-[var(--amber)]">
                    {s?.best_streak ?? 0}
                  </p>
                  <p className="text-[9px] text-[var(--muted)]">Racha</p>
                </div>
              </div>
              <p className="text-[10px] text-[var(--muted)]">
                XP {Number(s?.xp_earned ?? 0)}
                {g === "blackjack"
                  ? ` · 🃏 ${s?.blackjacks ?? 0} · ★${Number(s?.tokens_won ?? 0)}/−${Number(s?.tokens_lost ?? 0)}`
                  : ""}
                {g === "carrera"
                  ? ` · 🏅 ${s?.podiums ?? 0} · ★${Number(s?.tokens_won ?? 0)}/−${Number(s?.tokens_lost ?? 0)}`
                  : ""}
                {g === "rey" ? ` · 👑 ${s?.kings_found ?? 0}` : ""}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4">
        <StartGameForm
          gameType="carrera"
          label="Carrera de Caballos"
          blurb="2–4 jinetes. Apuesta al bote. El primero en meta se lo lleva."
          friends={friendUsers ?? []}
          meName={profile.display_name}
          meId={profile.id}
          tokenBalance={tokens}
        />
        <StartGameForm
          gameType="blackjack"
          label="BlackJack"
          blurb="Apuesta fichas. Gana ×2, BlackJack ×2.5, empate recuperas."
          tokenBalance={tokens}
        />
        <StartGameForm
          gameType="peaje"
          label="Peaje"
          blurb="Acierta cartas en 6 fases. Perfecto = Sin Frenos."
        />
        <StartGameForm
          gameType="rey"
          label="Rey"
          blurb="Saca cartas hasta los 4 Reyes. Cada una manda una acción."
        />
        <StartGameForm
          gameType="duelo"
          label="Duelo"
          blurb="Carta vs carta. Elige rival de amigos o escribe un nombre."
          needsOpponent
          friends={friendUsers ?? []}
        />
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-xl">Historial reciente</h2>
        <ul className="mt-3 space-y-2">
          {(recent ?? []).map((g) => (
            <li key={g.id}>
              <Link
                href={`/app/games/play?id=${encodeURIComponent(g.id)}`}
                className="rank-row flex min-h-12 items-center justify-between px-4 py-3 transition hover:border-[var(--teal)]"
              >
                <span className="font-semibold">
                  {GAME_LABELS[g.game_type] ?? g.game_type}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {g.status === "finished" ? "Terminada" : "En curso"} ·{" "}
                  {new Date(g.created_at).toLocaleDateString("es-ES")}
                </span>
              </Link>
            </li>
          ))}
          {!recent?.length ? (
            <li className="text-sm text-[var(--muted)]">Aún no hay partidas. ¡Pulsa Jugar!</li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
