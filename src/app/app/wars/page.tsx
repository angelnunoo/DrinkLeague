import { redirect } from "next/navigation";
import { getCurrentProfile, getMyLeagues } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { DeclareWarForm } from "@/components/declare-war-form";
import { SettleWarButton } from "@/components/settle-war-button";

const TIER_LABEL: Record<string, string> = {
  bronze: "Bronce",
  silver: "Plata",
  gold: "Oro",
  platinum: "Platino",
  diamond: "Diamante",
  master: "Maestro",
  legend: "Leyenda",
};

export default async function WarsPage({
  searchParams,
}: {
  searchParams: Promise<{ declared?: string; settled?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const leagues = await getMyLeagues();
  const leagueIds = leagues.map((l) => l.id);
  const captainLeagues = leagues
    .filter((l) => l.membership_role === "league_admin")
    .map((l) => ({ id: l.id, name: l.name }));

  const supabase = await createClient();

  // Ensure divisions exist for my leagues (best-effort via select + client can't call ensure; skip)
  const { data: divisions } = leagueIds.length
    ? await supabase.from("league_divisions").select("*").in("league_id", leagueIds)
    : { data: [] };

  const { data: wars } = leagueIds.length
    ? await supabase
        .from("league_wars")
        .select("*")
        .or(`league_a.in.(${leagueIds.join(",")}),league_b.in.(${leagueIds.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] };

  const warLeagueIds = [
    ...new Set((wars ?? []).flatMap((w) => [w.league_a, w.league_b])),
  ];
  const { data: warLeagues } = warLeagueIds.length
    ? await supabase.from("leagues").select("id, name").in("id", warLeagueIds)
    : { data: [] };
  const leagueName = new Map((warLeagues ?? []).map((l) => [l.id, l.name]));

  const warIds = (wars ?? []).map((w) => w.id);
  const { data: mvps } = warIds.length
    ? await supabase
        .from("war_member_scores")
        .select("war_id, user_id, points")
        .in("war_id", warIds)
        .order("points", { ascending: false })
    : { data: [] };

  const mvpByWar = new Map<string, { user_id: string; points: number }>();
  for (const row of mvps ?? []) {
    if (!mvpByWar.has(row.war_id)) mvpByWar.set(row.war_id, row);
  }
  const mvpUserIds = [...new Set([...mvpByWar.values()].map((m) => m.user_id))];
  const { data: mvpUsers } = mvpUserIds.length
    ? await supabase.from("users").select("id, display_name").in("id", mvpUserIds)
    : { data: [] };
  const mvpNames = new Map((mvpUsers ?? []).map((u) => [u.id, u.display_name]));

  // Seed missing divisions display as bronze
  const divMap = new Map((divisions ?? []).map((d) => [d.league_id, d]));

  return (
    <section className="animate-rise space-y-6">
      <div>
        <h1 className="font-display text-3xl">Guerras de ligas</h1>
        <p className="mt-1 text-[var(--muted)]">
          7 días · suma de puntos · MVP · divisiones competitivas.
        </p>
      </div>

      {sp.declared ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          ¡Guerra declarada! Cada consumición suma al marcador.
        </p>
      ) : null}
      {sp.settled ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--amber)_15%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
          Guerra cerrada. Trofeos y división actualizados.
        </p>
      ) : null}

      <div className="surface p-5">
        <h2 className="font-display text-xl">Declarar guerra</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Usa el código de invitación de la liga rival (el que comparten sus miembros).
        </p>
        <div className="mt-3">
          <DeclareWarForm captainLeagues={captainLeagues} />
        </div>
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-xl">Tus divisiones</h2>
        {!leagues.length ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Únete a una liga primero.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {leagues.map((l) => {
              const d = divMap.get(l.id);
              return (
                <li key={l.id} className="flex justify-between text-sm">
                  <span>{l.name}</span>
                  <span className="text-[var(--amber)]">
                    {TIER_LABEL[d?.tier ?? "bronze"]} · {d?.trophies ?? 0} trofeos
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-xl">Historial de guerras</h2>
        {!(wars ?? []).length ? (
          <p className="text-sm text-[var(--muted)]">Todavía no has entrado en combate.</p>
        ) : (
          (wars ?? []).map((w) => {
            const mvp = mvpByWar.get(w.id);
            const ends = new Date(w.ends_at);
            return (
              <article key={w.id} className="surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg">
                      {leagueName.get(w.league_a) ?? "Liga A"}{" "}
                      <span className="text-[var(--muted)]">vs</span>{" "}
                      {leagueName.get(w.league_b) ?? "Liga B"}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {w.status} · fin {ends.toLocaleString("es-ES")}
                    </p>
                  </div>
                  <SettleWarButton warId={w.id} endsAt={w.ends_at} status={w.status} />
                </div>
                <p className="mt-3 font-display text-3xl text-[var(--amber)]">
                  {w.score_a} – {w.score_b}
                </p>
                {mvp ? (
                  <p className="mt-2 text-sm text-[var(--teal)]">
                    MVP: {mvpNames.get(mvp.user_id) ?? "Jugador"} ({mvp.points} pts)
                  </p>
                ) : null}
                {w.status === "completed" ? (
                  <p className="mt-1 text-sm">
                    {w.winner_league_id
                      ? `Ganador: ${leagueName.get(w.winner_league_id) ?? "Liga"}`
                      : "Empate"}
                  </p>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
