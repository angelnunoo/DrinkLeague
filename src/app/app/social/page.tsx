import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { FriendActions } from "@/components/friend-actions";

function chemTier(score: number): string {
  if (score >= 95) return "Leyendas Inseparables";
  if (score >= 80) return "Hermanos de Barra";
  if (score >= 60) return "Grandes Amigos";
  if (score >= 40) return "Amigos";
  if (score >= 20) return "Compañeros";
  return "Desconocidos";
}

export default async function SocialPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  const [{ data: incoming }, { data: friendships }, { data: feed }, { data: pairs }] =
    await Promise.all([
      supabase
        .from("friend_requests")
        .select("id, from_user_id, created_at, users:from_user_id(display_name, friend_code, level)")
        .eq("to_user_id", profile.id)
        .eq("status", "pending"),
      supabase
        .from("friendships")
        .select("id, user_a, user_b, chemistry_level, chemistry_xp, chemistry_score, shared_activities")
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
  const { data: people } = actorIds.length
    ? await supabase
        .from("users")
        .select("id, display_name, friend_code, level, title, xp")
        .in("id", actorIds)
    : { data: [] };
  const peopleMap = new Map((people ?? []).map((u) => [u.id, u]));

  return (
    <section className="animate-rise space-y-6">
      <div>
        <h1 className="font-display text-3xl">Social</h1>
        <p className="mt-1 text-[var(--muted)]">Amigos, química 0–100, feed y parejas legendarias.</p>
      </div>

      <div className="surface p-5">
        <p className="text-sm text-[var(--muted)]">Tu código de amigo</p>
        <p className="font-display text-3xl tracking-[0.25em] text-[var(--amber)]">
          {profile.friend_code ?? "———"}
        </p>
      </div>

      <FriendActions />

      <div className="surface p-5">
        <h2 className="font-display text-xl">Solicitudes</h2>
        {!incoming?.length ? (
          <p className="mt-3 text-sm text-[var(--muted)]">No hay solicitudes pendientes.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {incoming.map((req) => {
              const from = req.users as unknown as {
                display_name: string;
                friend_code: string;
                level: number;
              } | null;
              return (
                <li
                  key={req.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3"
                >
                  <div>
                    <p className="font-semibold">{from?.display_name ?? "Usuario"}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {from?.friend_code} · Nv. {from?.level ?? 1}
                    </p>
                  </div>
                  <FriendActions requestId={req.id} mode="respond" />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-xl">Amigos · Química</h2>
        {!friendships?.length ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Aún no tienes amigos.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {friendships.map((f) => {
              const otherId = f.user_a === profile.id ? f.user_b : f.user_a;
              const u = peopleMap.get(otherId);
              const score = Number(f.chemistry_score ?? f.chemistry_xp ?? 0);
              return (
                <li key={f.id} className="border-b border-[var(--line)] pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{u?.display_name ?? "Amigo"}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {chemTier(score)} · {f.shared_activities ?? 0} actividades
                      </p>
                    </div>
                    <span className="font-display text-xl text-[var(--amber)]">{score}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                    <div
                      className="h-full rounded-full bg-[var(--teal)]"
                      style={{ width: `${Math.min(100, score)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-xl">Parejas legendarias</h2>
        <p className="text-sm text-[var(--muted)]">Ranking histórico · química ≥ 80</p>
        <ul className="mt-3 space-y-3">
          {(pairs ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between border-b border-[var(--line)] pb-2">
              <div>
                <p className="font-semibold">
                  🔥 {p.name_a} + {p.name_b}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {p.tier} · {p.shared_activities} actividades
                </p>
              </div>
              <span className="font-display text-lg text-[var(--amber)]">{p.chemistry_score}%</span>
            </li>
          ))}
          {!pairs?.length ? (
            <li className="text-sm text-[var(--muted)]">Aún no hay parejas en el umbral legendario.</li>
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
          {!feed?.length ? <li className="text-sm text-[var(--muted)]">Feed vacío.</li> : null}
        </ul>
      </div>

      <Link href="/app/challenges" className="btn-ghost inline-flex text-sm">
        Ir a desafíos →
      </Link>
    </section>
  );
}
