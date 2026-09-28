import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data";
import { PeajePlay, ReyPlay, DueloPlay } from "@/components/games/game-boards";
import { BlackjackPlay } from "@/components/games/blackjack-board";
import { CarreraPlay, type Horse, type RaceTick } from "@/components/games/horse-race-board";
import type { SpanishCard } from "@/components/games/spanish-card";
import type { PokerCard } from "@/components/games/poker-card";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  game_type: string;
  status: string;
  state: Record<string, unknown> | null;
  created_by: string;
};

async function loadSession(id: string): Promise<{
  session: SessionRow | null;
  players: Array<{ user_id: string; seat: number }>;
  names: Map<string, string>;
}> {
  const supabase = await createClient();

  const rpc = await supabase.rpc("get_my_game_session", {
    p_session_id: id,
  });

  let session: SessionRow | null = null;
  const rpcSession = rpc.error ? null : rpc.data;
  if (rpcSession && typeof rpcSession === "object" && !Array.isArray(rpcSession)) {
    const row = rpcSession as Record<string, unknown>;
    if (row.id) {
      session = {
        id: String(row.id),
        game_type: String(row.game_type ?? ""),
        status: String(row.status ?? "active"),
        state: (row.state as Record<string, unknown>) ?? null,
        created_by: String(row.created_by ?? ""),
      };
    }
  }

  if (!session) {
    const { data } = await supabase
      .from("game_sessions")
      .select("id, game_type, status, state, created_by")
      .eq("id", id)
      .maybeSingle();
    session = (data as SessionRow | null) ?? null;
  }

  if (!session) {
    return { session: null, players: [], names: new Map() };
  }

  const { data: players } = await supabase
    .from("game_players")
    .select("user_id, seat")
    .eq("session_id", id)
    .order("seat");

  const list = (players ?? []) as Array<{ user_id: string; seat: number }>;
  const pids = list.map((p) => p.user_id);
  const { data: users } = pids.length
    ? await supabase.from("users").select("id, display_name").in("id", pids)
    : { data: [] };
  const names = new Map((users ?? []).map((u) => [u.id, u.display_name as string]));

  return { session, players: list, names };
}

function normalizePhase(status: string, raw: unknown): string {
  if (status === "finished") return "finished";
  const p = String(raw ?? "intro");
  if (p === "ready" || p === "start" || !p) return "intro";
  return p;
}

function asPokerHand(raw: unknown): PokerCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is PokerCard =>
      !!c && typeof c === "object" && typeof (c as PokerCard).rank === "number",
  );
}

export default async function GamePlayPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const id = String(sp.id ?? "").trim();
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return <MissingGame message="No hay partida seleccionada." />;
  }

  const { session, players, names } = await loadSession(id);

  if (!session) {
    return <MissingGame message="No se pudo cargar esta partida. Empieza una nueva." />;
  }

  const state = (session.state ?? {}) as Record<string, unknown>;
  const type = session.game_type;
  const isCasino = type === "blackjack" || type === "carrera";
  const shell =
    type === "rey"
      ? "game-card-rey"
      : type === "duelo"
        ? "game-card-duelo"
        : type === "blackjack"
          ? "game-card-blackjack"
          : type === "carrera"
            ? "game-card-carrera"
            : "game-card-peaje";
  const title =
    type === "peaje"
      ? "Peaje"
      : type === "rey"
        ? "Rey"
        : type === "duelo"
          ? "Duelo"
          : type === "blackjack"
            ? "BlackJack"
            : type === "carrera"
              ? "Carrera de Caballos"
              : "Juego";
  const playerNames = players.map((p) => names.get(p.user_id) ?? "?");
  const guest = typeof state.guest_name === "string" ? state.guest_name : null;
  const seat1 = players.find((p) => p.seat === 1)?.user_id;
  const rivalName = seat1 ? (names.get(seat1) ?? "Rival") : guest ?? "Invitado";

  if (!["peaje", "rey", "duelo", "blackjack", "carrera"].includes(type)) {
    return <MissingGame message="Tipo de juego no válido." />;
  }

  return (
    <section className="animate-rise space-y-5">
      <div>
        <Link
          href={isCasino ? "/app/casino" : "/app/games"}
          className="text-sm text-[var(--muted)] hover:text-[var(--ink)]"
        >
          ← {isCasino ? "DrinkCasino" : "Juegos"}
        </Link>
        <h1 className="mt-2 font-display text-3xl">{title}</h1>
        <p className="text-sm text-[var(--muted)]">
          {session.status === "finished" ? "Terminada" : "En curso"}
          {playerNames.length ? ` · ${playerNames.join(" · ")}` : ""}
          {guest && !seat1 ? ` · ${guest}` : ""}
        </p>
      </div>

      {sp.error ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}

      <div className={`game-card ${shell} !min-h-[24rem] !justify-start gap-4 p-5`}>
        {type === "carrera" ? (
          <CarreraPlay
            sessionId={id}
            initial={{
              phase: normalizePhase(session.status, state.phase),
              stake: state.stake != null ? Number(state.stake) : undefined,
              pot: state.pot != null ? Number(state.pot) : undefined,
              track_length: state.track_length != null ? Number(state.track_length) : 20,
              horses: Array.isArray(state.horses) ? (state.horses as Horse[]) : [],
              ticks: Array.isArray(state.ticks) ? (state.ticks as RaceTick[]) : [],
              standings: Array.isArray(state.standings) ? (state.standings as Horse[]) : [],
              winner: state.winner ? String(state.winner) : undefined,
            }}
          />
        ) : null}

        {type === "blackjack" ? (
          <BlackjackPlay
            sessionId={id}
            initial={{
              phase: normalizePhase(session.status, state.phase === "intro" ? "player" : state.phase),
              player: asPokerHand(state.player),
              dealer: asPokerHand(state.dealer),
              player_total:
                state.player_total != null ? Number(state.player_total) : undefined,
              dealer_total:
                state.dealer_total != null ? Number(state.dealer_total) : undefined,
              dealer_shown:
                state.dealer_shown != null ? Number(state.dealer_shown) : undefined,
              hide_dealer: state.hide_dealer !== false && session.status !== "finished",
              result: state.result ? String(state.result) : undefined,
              message: state.message ? String(state.message) : undefined,
              xp: state.xp != null ? Number(state.xp) : undefined,
              tokens: state.tokens != null ? Number(state.tokens) : undefined,
              stake: state.stake != null ? Number(state.stake) : undefined,
              payout: state.payout != null ? Number(state.payout) : undefined,
            }}
          />
        ) : null}

        {type === "peaje" ? (
          <PeajePlay
            sessionId={id}
            initial={{
              phase: normalizePhase(session.status, state.phase),
              step: Number(state.step ?? 0),
              hits: Number(state.hits ?? 0),
              misses: Number(state.misses ?? 0),
              last_card: state.last_card as SpanishCard | undefined,
              last_result: state.last_result ? String(state.last_result) : undefined,
              history: state.history as Array<{
                step: number;
                card: SpanishCard;
                result: string;
              }>,
              won: typeof state.won === "boolean" ? state.won : undefined,
              perfect: typeof state.perfect === "boolean" ? state.perfect : undefined,
              xp: state.xp != null ? Number(state.xp) : undefined,
              tokens: state.tokens != null ? Number(state.tokens) : undefined,
              went_back: state.went_back === true,
              prev_rank:
                state.prev_rank != null && state.prev_rank !== ""
                  ? Number(state.prev_rank)
                  : null,
            }}
          />
        ) : null}

        {type === "rey" ? (
          <ReyPlay
            sessionId={id}
            players={playerNames}
            initial={{
              phase: normalizePhase(session.status, state.phase),
              kings: Number(state.kings ?? 0),
              turns: Number(state.turns ?? 0),
              last_card: state.last_card as SpanishCard | undefined,
              last_effect: state.last_effect ? String(state.last_effect) : undefined,
              xp: state.xp != null ? Number(state.xp) : undefined,
              tokens: state.tokens != null ? Number(state.tokens) : undefined,
              duration_sec: state.duration_sec != null ? Number(state.duration_sec) : undefined,
            }}
          />
        ) : null}

        {type === "duelo" ? (
          <DueloPlay
            sessionId={id}
            meName={profile.display_name}
            rivalName={rivalName}
            initial={{
              phase: normalizePhase(session.status, state.phase),
              guest_name: guest,
              last: (state.last ?? undefined) as
                | {
                    card1?: SpanishCard;
                    card2?: SpanishCard;
                    name1?: string;
                    name2?: string;
                    winner?: string;
                    loser?: string;
                    ties?: number;
                  }
                | undefined,
              xp: state.xp != null ? Number(state.xp) : undefined,
              tokens: state.tokens != null ? Number(state.tokens) : undefined,
              ties: state.ties != null ? Number(state.ties) : undefined,
              won_by_me: typeof state.won_by_me === "boolean" ? state.won_by_me : undefined,
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function MissingGame({ message }: { message: string }) {
  return (
    <section className="animate-rise flex min-h-[50dvh] flex-col items-center justify-center gap-5 px-4 text-center">
      <p className="text-5xl" aria-hidden>
        ⚠️
      </p>
      <h1 className="font-display text-3xl">No se pudo abrir la partida</h1>
      <p className="max-w-sm text-sm text-[var(--muted)]">{message}</p>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Link href="/app/games" className="btn-primary min-h-12 px-8">
          Volver a Juegos
        </Link>
        <Link href="/app/casino" className="btn-ghost min-h-12 px-8">
          DrinkCasino
        </Link>
      </div>
    </section>
  );
}
