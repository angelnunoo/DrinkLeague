import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data";
import { playDueloAction, drawReyAction, playPeajeAction } from "@/app/actions";

const CARD_NAMES: Record<number, string> = {
  1: "As",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "Sota",
  9: "Caballo",
  10: "Rey",
  11: "11",
  12: "12",
};

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

  const state = (session.state ?? {}) as Record<string, unknown>;
  const finished = session.status === "finished";
  const type = session.game_type as string;
  const shell =
    type === "rey" ? "game-card-rey" : type === "duelo" ? "game-card-duelo" : "game-card-peaje";

  return (
    <section className="animate-rise space-y-5">
      <div>
        <Link href="/app/games" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          ← Juegos
        </Link>
        <h1 className="mt-2 font-display text-3xl capitalize">{session.game_type}</h1>
        <p className="text-sm text-[var(--muted)]">
          {finished ? "Terminada" : "En curso"} ·{" "}
          {(players ?? []).map((p) => umap.get(p.user_id) ?? "?").join(" · ")}
        </p>
      </div>

      {sp.error ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}

      <div className={`game-card ${shell} !min-h-[22rem] items-center justify-center text-center`}>
        {session.game_type === "rey" ? (
          <>
            {state.last_card != null ? (
              <div className="playing-card w-36">
                <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Carta</p>
                <p className="font-display text-5xl text-[var(--amber)]">
                  {CARD_NAMES[Number(state.last_card)] ?? String(state.last_card)}
                </p>
                <p className="mt-2 px-2 text-sm">{String(state.last_effect ?? "")}</p>
              </div>
            ) : (
              <p className="text-[var(--muted)]">Roba la primera carta.</p>
            )}
            <p className="mt-4 text-sm text-[var(--muted)]">
              Reyes: {String(state.kings ?? 0)}/4
            </p>
            {!finished ? (
              <form action={drawReyAction.bind(null, id)} className="mt-4 w-full max-w-xs">
                <button type="submit" className="mega-cta !text-lg">
                  Robar carta
                </button>
              </form>
            ) : (
              <p className="mt-4 text-[var(--teal)]">¡Salieron los 4 reyes!</p>
            )}
          </>
        ) : null}

        {session.game_type === "duelo" ? (
          <>
            {state.last ? (
              <div className="flex w-full max-w-sm items-center justify-center gap-3">
                <div className="playing-card w-28">
                  <p className="text-[10px] text-[var(--muted)]">Tú</p>
                  <p className="font-display text-4xl text-[var(--amber)]">
                    {(state.last as { card1: number }).card1}
                  </p>
                </div>
                <span className="font-display text-2xl text-[var(--danger)]">VS</span>
                <div className="playing-card w-28">
                  <p className="text-[10px] text-[var(--muted)]">Rival</p>
                  <p className="font-display text-4xl text-[var(--amber)]">
                    {(state.last as { card2: number }).card2}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[var(--muted)]">Lanza el duelo: carta más alta gana.</p>
            )}
            {state.last && typeof state.last === "object" && "winner" in (state.last as object) ? (
              <p className="mt-4 font-display text-xl text-[var(--teal)]">
                Resultado: {String((state.last as { winner?: string }).winner ?? "empate")}
              </p>
            ) : null}
            {!finished ? (
              <form action={playDueloAction.bind(null, id)} className="mt-4 w-full max-w-xs">
                <button type="submit" className="mega-cta !text-lg">
                  Duelar
                </button>
              </form>
            ) : (
              <p className="mt-4 text-[var(--teal)]">Duelo resuelto.</p>
            )}
          </>
        ) : null}

        {session.game_type === "peaje" ? (
          <>
            {state.last_roll != null ? (
              <div className="playing-card w-40 animate-pop">
                <p className="text-xs uppercase text-[var(--muted)]">Tirada</p>
                <p className="font-display text-6xl text-[var(--amber)]">
                  {String(state.last_roll)}
                </p>
                <p className="mt-2 px-3 text-sm">{String(state.last_effect ?? "")}</p>
              </div>
            ) : (
              <p className="text-[var(--muted)]">Gira el peaje.</p>
            )}
            <form action={playPeajeAction.bind(null, id)} className="mt-4 w-full max-w-xs">
              <button type="submit" className="mega-cta !text-lg">
                Girar
              </button>
            </form>
          </>
        ) : null}
      </div>
    </section>
  );
}
