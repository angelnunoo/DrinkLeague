import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { getCurrentProfile, getMyLeagues } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { FriendActions } from "@/components/friend-actions";
import { FriendSearch } from "@/components/friend-search";
import { FriendsRoster, type FriendCardData } from "@/components/friends-roster";
import { LeagueInviteShare } from "@/components/league-invite-share";
import { FriendInviteShare } from "@/components/friend-invite-share";
import { formatFriendInviteLink, formatInviteLink, xpProgress } from "@/lib/domain";
import { appOriginFromHeaders } from "@/lib/supabase/cookie-options";

function chemTier(score: number): string {
  if (score >= 95) return "Leyendas Inseparables";
  if (score >= 80) return "Hermanos de Barra";
  if (score >= 60) return "Grandes Amigos";
  if (score >= 40) return "Amigos";
  if (score >= 20) return "Compañeros";
  return "Desconocidos";
}

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ friend_sent?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;

  const supabase = await createClient();
  const origin = appOriginFromHeaders(await headers());
  const myLeagues = await getMyLeagues();
  const friendCode = (profile.friend_code ?? "").toUpperCase();
  const friendInviteUrl = friendCode ? formatFriendInviteLink(friendCode, origin) : "";

  const leagueInvites = await Promise.all(
    myLeagues.slice(0, 4).map(async (league) => {
      const { data: code } = await supabase.rpc("ensure_league_invite", {
        p_league_id: league.id,
      });
      return {
        league,
        code: code ? String(code) : null,
      };
    }),
  );

  const [{ data: incoming }, { data: friendships }, { data: feed }, { data: pairs }] =
    await Promise.all([
      supabase
        .from("friend_requests")
        .select(
          "id, from_user_id, created_at, users:from_user_id(display_name, friend_code, level, avatar_url, title)",
        )
        .eq("to_user_id", profile.id)
        .eq("status", "pending"),
      supabase
        .from("friendships")
        .select(
          "id, user_a, user_b, chemistry_level, chemistry_xp, chemistry_score, shared_activities",
        )
        .or(`user_a.eq.${profile.id},user_b.eq.${profile.id}`),
      supabase
        .from("activity_events")
        .select("id, league_id, actor_user_id, event_type, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase.from("legendary_pairs").select("*").limit(10),
    ]);

  const friendIds = (friendships ?? []).map((f) =>
    f.user_a === profile.id ? f.user_b : f.user_a,
  );
  const actorIds = [
    ...new Set([
      ...friendIds,
      ...((feed ?? []).map((e) => e.actor_user_id).filter(Boolean) as string[]),
    ]),
  ];

  const [{ data: people }, { data: friendStats }] = await Promise.all([
    actorIds.length
      ? supabase
          .from("users")
          .select(
            "id, display_name, friend_code, username, level, title, xp, avatar_url, prestige_level",
          )
          .in("id", actorIds)
      : Promise.resolve({ data: [] as never[] }),
    friendIds.length
      ? supabase
          .from("user_stats_global")
          .select("user_id, total_points, total_logs")
          .in("user_id", friendIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const peopleMap = new Map((people ?? []).map((u) => [u.id, u]));
  const statsMap = new Map((friendStats ?? []).map((s) => [s.user_id, s] as const));

  const friendCards: FriendCardData[] = (friendships ?? []).map((f) => {
    const otherId = f.user_a === profile.id ? f.user_b : f.user_a;
    const u = peopleMap.get(otherId);
    const stats = statsMap.get(otherId);
    const score = Number(f.chemistry_score ?? f.chemistry_xp ?? 0);
    const xp = Number(u?.xp ?? 0);
    const progress = xpProgress(xp);
    return {
      id: otherId,
      display_name: u?.display_name ?? "Amigo",
      friend_code: u?.friend_code ?? null,
      username: u?.username ?? null,
      avatar_url: u?.avatar_url ?? null,
      title: u?.title ?? null,
      level: Number(u?.level ?? progress.level),
      xp,
      prestige_level: u?.prestige_level ?? null,
      chemistry_score: score,
      chemistry_tier: chemTier(score),
      shared_activities: Number(f.shared_activities ?? 0),
      total_points: stats ? Number(stats.total_points ?? 0) : undefined,
      total_logs: stats ? Number(stats.total_logs ?? 0) : undefined,
    };
  });

  return (
    <section className="animate-rise space-y-6">
      <div>
        <h1 className="font-display text-3xl">Social</h1>
        <p className="mt-1 text-[var(--muted)]">
          Tus amigos, perfiles y química de barra.
        </p>
      </div>

      {sp.friend_sent ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-4 py-3 text-sm text-[var(--teal)]">
          Solicitud de amistad enviada.
        </p>
      ) : null}

      <FriendsRoster friends={friendCards} />

      {friendCode ? (
        <FriendInviteShare
          displayName={profile.display_name}
          friendCode={friendCode}
          inviteUrl={friendInviteUrl}
        />
      ) : (
        <div className="surface p-5 text-sm text-[var(--muted)]">
          Aún no tienes código de amigo. Recarga el perfil o contacta soporte.
        </div>
      )}

      <FriendSearch />

      <FriendActions />

      <div className="surface p-5">
        <h2 className="font-display text-xl">Solicitudes</h2>
        {!incoming?.length ? (
          <p className="mt-3 text-sm text-[var(--muted)]">No hay solicitudes pendientes.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(incoming ?? []).map((req) => {
              const from = req.users as unknown as {
                display_name: string;
                friend_code: string;
                level: number;
                avatar_url: string | null;
                title: string | null;
              } | null;
              const glyph = from?.avatar_url?.startsWith("emoji:")
                ? from.avatar_url.slice(6)
                : (from?.display_name?.slice(0, 1)?.toUpperCase() ?? "?");
              return (
                <li
                  key={req.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="friend-avatar !h-11 !w-11 !flex-[0_0_2.75rem] text-lg">
                      {glyph}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {from?.display_name ?? "Usuario"}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {from?.title ?? "Novato"} · Nv. {from?.level ?? 1}
                        {from?.friend_code ? ` · ${from.friend_code}` : ""}
                      </p>
                    </div>
                  </div>
                  <FriendActions requestId={req.id} mode="respond" />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Ligas</p>
            <h2 className="font-display text-xl">Invitar a tu liga</h2>
          </div>
          <Link href="/app/join" className="btn-ghost text-xs">
            Unirme con código
          </Link>
        </div>
        {!leagueInvites.length ? (
          <div className="surface p-5 text-sm text-[var(--muted)]">
            Aún no tienes ligas.{" "}
            <Link
              href="/app/leagues/new"
              className="font-semibold text-[var(--ink-strong)] underline-offset-2 hover:underline"
            >
              Crea una
            </Link>{" "}
            y comparte el enlace.
          </div>
        ) : (
          leagueInvites.map(({ league, code }) =>
            code ? (
              <LeagueInviteShare
                key={league.id}
                leagueName={league.name}
                code={code}
                inviteUrl={formatInviteLink(code, origin)}
                canRotate={league.membership_role === "league_admin"}
                leagueId={league.id}
              />
            ) : (
              <div key={league.id} className="surface p-4 text-sm text-[var(--muted)]">
                {league.name}: sin invitación activa.{" "}
                <Link
                  href={`/app/leagues/${league.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  Abrir liga
                </Link>
              </div>
            ),
          )
        )}
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-xl">Parejas legendarias</h2>
        <p className="text-sm text-[var(--muted)]">Ranking histórico · química ≥ 80</p>
        <ul className="mt-3 space-y-3">
          {(pairs ?? []).map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between border-b border-[var(--line)] pb-2"
            >
              <div>
                <p className="font-semibold">
                  🔥 {p.name_a} + {p.name_b}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {p.tier} · {p.shared_activities} actividades
                </p>
              </div>
              <span className="font-display text-lg text-[var(--amber)]">
                {p.chemistry_score}%
              </span>
            </li>
          ))}
          {!pairs?.length ? (
            <li className="text-sm text-[var(--muted)]">
              Aún no hay parejas en el umbral legendario.
            </li>
          ) : null}
        </ul>
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-xl">Feed</h2>
        <ul className="mt-3 space-y-3">
          {(feed ?? []).map((e) => {
            const actor = e.actor_user_id ? peopleMap.get(e.actor_user_id) : null;
            const payload = (e.payload ?? {}) as Record<string, unknown>;
            return (
              <li key={e.id} className="border-b border-[var(--line)] pb-2 text-sm">
                <p>
                  <span className="font-semibold">{actor?.display_name ?? "Alguien"}</span>{" "}
                  {e.event_type === "drink_logged"
                    ? `sumó +${String(payload.points ?? "?")} en ${String(payload.venue ?? "un local")}`
                    : e.event_type === "level_up"
                      ? `subió al nivel ${String(payload.to ?? "?")}`
                      : e.event_type}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {new Date(e.created_at).toLocaleString("es-ES")}
                </p>
              </li>
            );
          })}
          {!feed?.length ? (
            <li className="text-sm text-[var(--muted)]">Feed vacío.</li>
          ) : null}
        </ul>
      </div>

      <Link href="/app/challenges" className="btn-ghost inline-flex text-sm">
        Ir a desafíos →
      </Link>
    </section>
  );
}
