import { redirect } from "next/navigation";
import { getCurrentProfile, getMyLeagues } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { CreateChallengeForm } from "@/components/create-challenge-form";
import { ChallengeButtons } from "@/components/challenge-buttons";

export default async function ChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; settled?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const leagues = await getMyLeagues();

  const { data: myParts } = await supabase
    .from("challenge_participants")
    .select("challenge_id")
    .eq("user_id", profile.id);

  const ids = [...new Set((myParts ?? []).map((p) => p.challenge_id))];

  const { data: challenges } = ids.length
    ? await supabase
        .from("challenges")
        .select("*")
        .in("id", ids)
        .order("created_at", { ascending: false })
        .limit(40)
    : { data: [] };

  const challengeIds = (challenges ?? []).map((c) => c.id);
  const { data: participants } = challengeIds.length
    ? await supabase
        .from("challenge_participants")
        .select("challenge_id, user_id, side, points_scored")
        .in("challenge_id", challengeIds)
    : { data: [] };

  const userIds = [...new Set((participants ?? []).map((p) => p.user_id))];
  const { data: users } = userIds.length
    ? await supabase.from("users").select("id, display_name, friend_code").in("id", userIds)
    : { data: [] };
  const userMap = new Map((users ?? []).map((u) => [u.id, u]));

  const { data: rivalries } = await supabase
    .from("rivalries")
    .select("*")
    .or(`user_a.eq.${profile.id},user_b.eq.${profile.id}`)
    .limit(20);

  const rivUserIds = [
    ...new Set(
      (rivalries ?? []).flatMap((r) => [r.user_a, r.user_b]).filter((id) => id !== profile.id),
    ),
  ];
  const { data: rivUsers } = rivUserIds.length
    ? await supabase.from("users").select("id, display_name").in("id", rivUserIds)
    : { data: [] };
  const rivMap = new Map((rivUsers ?? []).map((u) => [u.id, u]));

  return (
    <section className="animate-rise space-y-6">
      <div>
        <h1 className="font-display text-3xl">Desafíos</h1>
        <p className="mt-1 text-[var(--muted)]">1v1, equipos, FFA y rivalidades permanentes.</p>
      </div>

      {sp.created ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          Desafío creado. Esperando aceptación.
        </p>
      ) : null}
      {sp.settled ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--amber)_15%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
          Desafío cerrado. Rivalidad actualizada.
        </p>
      ) : null}

      <div className="surface p-5">
        <h2 className="font-display text-xl">Nuevo desafío</h2>
        <div className="mt-3">
          <CreateChallengeForm leagues={leagues.map((l) => ({ id: l.id, name: l.name }))} />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-xl">Tus desafíos</h2>
        {!(challenges ?? []).length ? (
          <p className="text-sm text-[var(--muted)]">Aún no hay desafíos.</p>
        ) : (
          (challenges ?? []).map((c) => {
            const parts = (participants ?? []).filter((p) => p.challenge_id === c.id);
            const ends = new Date(c.ends_at);
            return (
              <article key={c.id} className="surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg uppercase tracking-wide text-[var(--amber)]">
                      {c.mode} · {c.status}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      Apuesta {c.stake_points} pts · hasta{" "}
                      {ends.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <ChallengeButtons challengeId={c.id} status={c.status} endsAt={c.ends_at} />
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {parts.map((p) => {
                    const u = userMap.get(p.user_id);
                    return (
                      <li key={`${c.id}-${p.user_id}`} className="flex justify-between">
                        <span>
                          <span className="text-[var(--muted)]">[{p.side}]</span>{" "}
                          {u?.display_name ?? "Usuario"}
                          {p.user_id === profile.id ? " (tú)" : ""}
                        </span>
                        <span className="font-display text-[var(--teal)]">{p.points_scored} pts</span>
                      </li>
                    );
                  })}
                </ul>
                {c.winner_side ? (
                  <p className="mt-2 text-sm text-[var(--amber)]">Ganador: lado {c.winner_side}</p>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-xl">Rivalidades</h2>
        {!(rivalries ?? []).length ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Gana un 1v1 para abrir rivalidad.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(rivalries ?? []).map((r) => {
              const otherId = r.user_a === profile.id ? r.user_b : r.user_a;
              const other = rivMap.get(otherId);
              const myWins = r.user_a === profile.id ? r.wins_a : r.wins_b;
              const theirWins = r.user_a === profile.id ? r.wins_b : r.wins_a;
              return (
                <li key={r.id} className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                  <div>
                    <p className="font-semibold">
                      Tú vs {other?.display_name ?? "Rival"}
                    </p>
                    <p className="text-xs text-[var(--muted)]">{r.draws} empates</p>
                  </div>
                  <p className="font-display text-xl text-[var(--amber)]">
                    {myWins}–{theirWins}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
