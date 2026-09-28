import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data";
import { PeajePlay, ReyPlay, DueloPlay } from "@/components/games/game-boards";
import type { SpanishCard } from "@/components/games/spanish-card";

export default async function GameSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!session) notFound();

  const { data: players } = await supabase
    .from("game_players")
    .select("user_id, seat")
    .eq("session_id", id)
    .order("seat");

  const pids = (players ?? []).map((p) => p.user_id);
  const { data: users } = pids.length
    ? await supabase.from("users").select("id, display_name").in("id", pids)
    : { data: [] };
  const umap = new Map((users ?? []).map((u) => [u.id, u.display_name]));
  const playerNames = (players ?? []).map((p) => umap.get(p.user_id) ?? "?");

  const state = (session.state ?? {}) as Record<string, unknown>;
  const type = session.game_type as string;
  const shell =
    type === "rey" ? "game-card-rey" : type === "duelo" ? "game-card-duelo" : "game-card-peaje";
  const title = type === "peaje" ? "Peaje" : type === "rey" ? "Rey" : "Duelo";

  const guest = typeof state.guest_name === "string" ? state.guest_name : null;
  const seat1 = (players ?? []).find((p) => p.seat === 1)?.user_id;
  const rivalName = seat1 ? (umap.get(seat1) ?? "Rival") : guest ?? "Invitado";

  return (
    <section className="animate-rise space-y-5">
      <div>
        <Link href="/app/games" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          ← Juegos
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
        {type === "peaje" ? (
          <PeajePlay
            sessionId={id}
            initial={{
              phase:
                session.status === "finished"
                  ? "finished"
                  : String(state.phase ?? "intro"),
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
            }}
          />
        ) : null}

        {type === "rey" ? (
          <ReyPlay
            sessionId={id}
            players={playerNames}
            initial={{
              phase:
                session.status === "finished"
                  ? "finished"
                  : String(state.phase ?? "intro"),
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
              phase:
                session.status === "finished"
                  ? "finished"
                  : String(state.phase ?? "intro"),
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
