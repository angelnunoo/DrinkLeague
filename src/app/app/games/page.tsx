import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { StartGameForm } from "@/components/start-game-form";

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: recent }, { data: streakRows }, { count: finishedCount }] = await Promise.all([
    supabase
      .from("game_sessions")
      .select("id, game_type, status, created_at, state")
      .eq("created_by", profile.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("user_streaks")
      .select("streak_type, current_count")
      .eq("user_id", profile.id)
      .eq("streak_type", "game_weeks"),
    supabase
      .from("game_sessions")
      .select("*", { count: "exact", head: true })
      .eq("created_by", profile.id)
      .eq("status", "finished"),
  ]);

  const byType = { peaje: 0, rey: 0, duelo: 0 };
  for (const g of recent ?? []) {
    if (g.game_type in byType) byType[g.game_type as keyof typeof byType] += 1;
  }
  const gameWeeks = streakRows?.[0]?.current_count ?? 0;

  return (
    <section className="animate-rise space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Arcade de mesa
        </p>
        <h1 className="font-display text-3xl">Juegos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Experiencia individual y de liga · Peaje · Rey · Duelo
        </p>
      </div>

      {sp.error ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <div className="stat-chip text-center">
          <p className="text-[9px] uppercase text-[var(--muted)]">Partidas</p>
          <p className="font-display text-2xl">{finishedCount ?? 0}</p>
        </div>
        <div className="stat-chip text-center">
          <p className="text-[9px] uppercase text-[var(--muted)]">Semanas</p>
          <p className="font-display text-2xl text-[var(--teal)]">{gameWeeks}</p>
        </div>
        <div className="stat-chip text-center">
          <p className="text-[9px] uppercase text-[var(--muted)]">Duelos</p>
          <p className="font-display text-2xl">{byType.duelo}</p>
        </div>
      </div>

      <div className="grid gap-3">
        <StartGameForm gameType="peaje" label="Peaje" blurb="Gira la ruleta. Paga… o no." />
        <StartGameForm gameType="rey" label="Rey" blurb="Roba hasta los 4 reyes." />
        <StartGameForm
          gameType="duelo"
          label="Duelo"
          blurb="Carta vs carta. La más alta gana."
          needsOpponent
        />
      </div>

      <div className="surface p-4">
        <h2 className="font-display text-xl">Historial reciente</h2>
        <p className="text-xs text-[var(--muted)]">
          Antes en Modo Fiesta · ahora vive en tu historial de juegos y liga
        </p>
        <ul className="mt-3 space-y-2">
          {(recent ?? []).map((g) => (
            <li key={g.id}>
              <Link
                href={`/app/games/${g.id}`}
                className="rank-row flex items-center justify-between px-4 py-3 transition hover:border-[var(--teal)]"
              >
                <span className="font-semibold capitalize">{g.game_type}</span>
                <span className="text-xs text-[var(--muted)]">{g.status}</span>
              </Link>
            </li>
          ))}
          {!recent?.length ? (
            <li className="text-sm text-[var(--muted)]">Aún no hay partidas.</li>
          ) : null}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/app/social" className="btn-ghost text-xs">
            Química →
          </Link>
          <Link href="/app/calendar" className="btn-ghost text-xs">
            Eventos →
          </Link>
          <Link href="/app/museum" className="btn-ghost text-xs">
            Historial / Museo →
          </Link>
        </div>
      </div>
    </section>
  );
}
