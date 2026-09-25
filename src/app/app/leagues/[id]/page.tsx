import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data";
import type { ActivityEvent } from "@/lib/types";
import { VisualLeaderboard } from "@/components/ui/visual-leaderboard";
import { RivalCard } from "@/components/ui/rival-card";
import { refreshPredictionsAction, leaveLeagueAction, kickLeagueMemberAction } from "@/app/actions";
import { isSuperadminRole } from "@/lib/errors";

type Period = "weekly" | "monthly" | "season";

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    logged?: string;
    created?: string;
    pred?: string;
    kicked?: string;
    error?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (sp.tab as Period) || "weekly";
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  // Refresh rivalries + ranks + predictions (best effort)
  await Promise.all([
    supabase.rpc("refresh_rivalries", { p_league_id: id }),
    supabase.rpc("snapshot_leaderboard_ranks", { p_league_id: id, p_period_type: "weekly" }),
    supabase.rpc("award_period_medals", { p_league_id: id, p_period_type: "weekly", p_period_key: null }),
  ]);

  const { data: league } = await supabase.from("leagues").select("*").eq("id", id).maybeSingle();
  if (!league) notFound();

  const { data: myMembership } = await supabase
    .from("league_memberships")
    .select("role, status")
    .eq("league_id", id)
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle();

  const isSuper = isSuperadminRole(profile.role);
  const isCaptain = myMembership?.role === "league_admin" || isSuper;

  const { data: invite } = await supabase
    .from("league_invites")
    .select("code")
    .eq("league_id", id)
    .eq("is_active", true)
    .maybeSingle();

  const { data: members } = await supabase
    .from("league_memberships")
    .select("user_id, role, joined_at, users(display_name, email)")
    .eq("league_id", id)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  const leaderboard = await fetchLeaderboard(supabase, id, tab);

  const week = new Date();
  // prev snapshot for deltas
  const { data: snaps } = await supabase
    .from("rank_snapshots")
    .select("user_id, rank, period_key")
    .eq("league_id", id)
    .eq("period_type", "weekly")
    .order("snapped_at", { ascending: false })
    .limit(80);

  const latestKey = snaps?.[0]?.period_key;
  const prevKeys = [...new Set((snaps ?? []).map((s) => s.period_key))];
  const prevKey = prevKeys.find((k) => k !== latestKey);
  const prevMap = new Map(
    (snaps ?? []).filter((s) => s.period_key === prevKey).map((s) => [s.user_id, s.rank]),
  );

  const { data: rivalRow } = await supabase
    .from("user_rivals")
    .select("*")
    .eq("user_id", profile.id)
    .eq("league_id", id)
    .maybeSingle();

  let rivalName: string | null = null;
  if (rivalRow?.rival_user_id) {
    const { data: ru } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", rivalRow.rival_user_id)
      .maybeSingle();
    rivalName = ru?.display_name ?? null;
  }

  const { data: prediction } = await supabase
    .from("ai_predictions")
    .select("*")
    .eq("league_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const predEntries = ((prediction?.payload as { entries?: Array<{ user_id: string; probability: number }> })
    ?.entries ?? []) as Array<{ user_id: string; probability: number }>;

  const predIds = predEntries.map((e) => e.user_id);
  const { data: predUsers } = predIds.length
    ? await supabase.from("users").select("id, display_name").in("id", predIds)
    : { data: [] };
  const predNames = new Map((predUsers ?? []).map((u) => [u.id, u.display_name]));

  const { data: events } = await supabase
    .from("activity_events")
    .select("id, league_id, actor_user_id, event_type, payload, created_at")
    .eq("league_id", id)
    .order("created_at", { ascending: false })
    .limit(12);

  const actorIds = [
    ...new Set((events ?? []).map((e) => e.actor_user_id).filter(Boolean)),
  ] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("users").select("id, display_name").in("id", actorIds)
    : { data: [] };
  const actorMap = new Map((actors ?? []).map((a) => [a.id, a]));

  const visualRows = leaderboard.map((r, i) => ({
    user_id: r.user_id,
    display_name: r.display_name,
    points: Number(r.points),
    level: r.level,
    title: r.title,
    rank: i + 1,
    prev_rank: prevMap.get(r.user_id) ?? null,
  }));

  void week;

  return (
    <section className="animate-rise space-y-6">
      <div>
        <Link href="/app/leagues" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          ← Ligas
        </Link>
        <h1 className="mt-2 font-display text-3xl">{league.name}</h1>
        {invite?.code ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Código:{" "}
            <span className="font-semibold tracking-widest text-[var(--ink-strong)]">
              {invite.code}
            </span>
          </p>
        ) : null}
        {sp.pred ? (
          <p className="mt-2 text-sm text-[var(--teal)]">Predicciones IA actualizadas.</p>
        ) : null}
        {sp.kicked ? (
          <p className="mt-2 text-sm text-[var(--teal)]">Miembro expulsado.</p>
        ) : null}
        {sp.error ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{sp.error}</p>
        ) : null}
      </div>

      <Link href="/app#registrar" className="mega-cta">
        🍺 Registrar bebida
      </Link>

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

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["weekly", "Semanal"],
            ["monthly", "Mensual"],
            ["season", "Temporada"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={`/app/leagues/${id}?tab=${key}`}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              tab === key
                ? "bg-[var(--ink)] text-[#0b1512]"
                : "border border-[var(--line)] text-[var(--muted)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <VisualLeaderboard meId={profile.id} rows={visualRows} />

      {/* Members */}
      <div className="surface space-y-3 p-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Plantilla</p>
          <h2 className="font-display text-xl">Miembros</h2>
        </div>
        <ul className="space-y-2">
          {(members ?? []).map((m) => {
            const u = m.users as unknown as { display_name: string; email: string } | null;
            const canKick =
              m.user_id !== profile.id &&
              (isSuper || (isCaptain && m.role !== "league_admin"));
            return (
              <li
                key={m.user_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u?.display_name ?? "Jugador"}</p>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    {m.role === "league_admin" ? "Capitán" : "Miembro"}
                    {isSuper && u?.email ? ` · ${u.email}` : ""}
                  </p>
                </div>
                {canKick ? (
                  <form action={kickLeagueMemberAction}>
                    <input type="hidden" name="league_id" value={id} />
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <button
                      type="submit"
                      className="rounded-full border border-[var(--danger)] px-3 py-1 text-[10px] font-bold text-[var(--danger)]"
                    >
                      Expulsar
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
          {!members?.length ? (
            <li className="text-sm text-[var(--muted)]">Sin miembros activos.</li>
          ) : null}
        </ul>

        {myMembership ? (
          <form action={leaveLeagueAction.bind(null, id)} className="pt-2">
            <button
              type="submit"
              className="w-full rounded-xl border border-[var(--danger)] px-4 py-3 text-sm font-semibold text-[var(--danger)]"
            >
              Abandonar liga
            </button>
          </form>
        ) : null}
      </div>

      {/* AI Predictions */}
      <div className="surface p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Predicciones IA</p>
            <h2 className="font-display text-xl">Probabilidad de ganar</h2>
          </div>
          <form action={refreshPredictionsAction.bind(null, id)}>
            <button type="submit" className="btn-ghost text-xs">
              Actualizar
            </button>
          </form>
        </div>
        <ul className="mt-3 space-y-2">
          {predEntries.slice(0, 6).map((e) => (
            <li key={e.user_id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-semibold">
                {predNames.get(e.user_id) ?? "?"}
              </span>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--line)]">
                <div
                  className="h-full rounded-full bg-[var(--teal)]"
                  style={{ width: `${Math.min(100, Number(e.probability))}%` }}
                />
              </div>
              <span className="font-display text-[var(--amber)] w-12 text-right">
                {Number(e.probability).toFixed(0)}%
              </span>
            </li>
          ))}
          {!predEntries.length ? (
            <li className="text-sm text-[var(--muted)]">Pulsa actualizar para generar predicciones.</li>
          ) : null}
        </ul>
      </div>

      <div>
        <h2 className="font-display text-2xl">Feed</h2>
        <ul className="mt-3 space-y-2">
          {(events as ActivityEvent[] | null)?.length ? (
            (events as ActivityEvent[]).map((event) => {
              const actor = event.actor_user_id ? actorMap.get(event.actor_user_id) : null;
              return (
                <li key={event.id} className="rank-row px-4 py-3 text-sm">
                  <p>
                    <span className="font-semibold">{actor?.display_name ?? "Alguien"}</span>{" "}
                    {describeEvent(event)}
                  </p>
                </li>
              );
            })
          ) : (
            <li className="text-[var(--muted)]">Sin actividad.</li>
          )}
        </ul>
      </div>
    </section>
  );
}

async function fetchLeaderboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leagueId: string,
  tab: Period,
) {
  const table =
    tab === "monthly"
      ? "leaderboard_monthly"
      : tab === "season"
        ? "leaderboard_season"
        : "leaderboard_weekly";

  const periodColumn =
    tab === "monthly" ? "month_start_date" : tab === "season" ? "season_year" : "week_start_date";

  const { data: latest } = await supabase
    .from(table)
    .select(periodColumn)
    .eq("league_id", leagueId)
    .order(periodColumn, { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return [];

  const periodValue = (latest as Record<string, unknown>)[periodColumn];

  const { data: rows } = await supabase
    .from(table)
    .select("user_id, points, logs_count")
    .eq("league_id", leagueId)
    .eq(periodColumn, periodValue)
    .order("points", { ascending: false })
    .limit(50);

  if (!rows?.length) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: users } = await supabase
    .from("users")
    .select("id, display_name, level, title")
    .in("id", userIds);
  const userMap = new Map((users ?? []).map((u) => [u.id, u]));

  return rows.map((r) => ({
    user_id: r.user_id,
    points: r.points,
    logs_count: r.logs_count,
    display_name: userMap.get(r.user_id)?.display_name ?? "Usuario",
    level: userMap.get(r.user_id)?.level ?? 1,
    title: userMap.get(r.user_id)?.title ?? null,
  }));
}

function describeEvent(event: ActivityEvent): string {
  const payload = event.payload ?? {};
  switch (event.event_type) {
    case "drink_logged":
      return `registró bebidas (+${String(payload.points ?? "?")})`;
    case "joined_league":
      return "se unió a la liga";
    case "level_up":
      return `subió al nivel ${String(payload.to ?? "?")}`;
    default:
      return event.event_type;
  }
}
