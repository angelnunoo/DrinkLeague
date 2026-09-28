import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSuperadminRole } from "@/lib/errors";
import {
  adminAdjustLeaguePointsAction,
  adminSetLeaguePointsAction,
  adminLogDrinksForUserAction,
  adminVoidDrinkLogAction,
  kickLeagueMemberAction,
} from "@/app/actions";
import { DRINK_LABELS, type DrinkCode } from "@/lib/types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function AdminLeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isSuperadminRole(profile.role)) redirect("/app");

  const supabase = await createClient();
  const { data: league } = await supabase.from("leagues").select("*").eq("id", id).maybeSingle();
  if (!league) notFound();

  const { data: memberIds } = await supabase
    .from("league_memberships")
    .select("user_id")
    .eq("league_id", id)
    .eq("status", "active");

  const ids = (memberIds ?? []).map((m) => m.user_id);

  const [{ data: members }, { data: logs }] = await Promise.all([
    supabase.rpc("admin_league_members", { p_league_id: id }),
    ids.length
      ? supabase
          .from("drink_logs")
          .select(
            "id, user_id, venue_name_snapshot, consumed_at, points_total, users(display_name), drink_log_items(quantity, drink_types(code))",
          )
          .eq("status", "active")
          .in("user_id", ids)
          .order("consumed_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  return (
    <section className="animate-rise space-y-6">
      <div>
        <Link href="/app/admin?tab=leagues" className="text-sm text-[var(--muted)]">
          ← Admin ligas
        </Link>
        <h1 className="mt-2 font-display text-3xl">{league.name}</h1>
        <p className="text-sm text-[var(--muted)]">
          {league.status} · {new Date(league.created_at).toLocaleDateString("es-ES")}
        </p>
      </div>

      {sp.ok ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-4 py-3 text-sm text-[var(--teal)]">
          OK: {sp.ok}
        </p>
      ) : null}
      {sp.error ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">
          {sp.error}
        </p>
      ) : null}

      <h2 className="font-display text-2xl">Usuarios de la liga</h2>
      <ul className="space-y-3">
        {(members ?? []).map(
          (m: {
            user_id: string;
            display_name: string;
            level: number;
            total_points: number;
            total_logs: number;
            last_log_at: string | null;
            role: string;
            weekly_points: number;
            weekly_rank: number;
          }) => (
            <li key={m.user_id} className="surface space-y-3 p-4">
              <Link href={`/app/admin/users/${m.user_id}`} className="flex items-center gap-3">
                <div className="avatar-ring flex h-12 w-12 items-center justify-center text-sm font-bold">
                  {initials(m.display_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {m.display_name}
                    {m.weekly_rank ? (
                      <span className="ml-2 text-[var(--amber)]">#{m.weekly_rank}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Nv.{m.level} · {m.role} · {Number(m.total_logs)} bebidas
                  </p>
                </div>
                <p className="font-display text-xl text-[var(--amber)]">
                  {Number(m.total_points).toLocaleString("es-ES")}
                </p>
              </Link>
              <p className="text-xs text-[var(--muted)]">
                Última actividad:{" "}
                {m.last_log_at ? new Date(m.last_log_at).toLocaleString("es-ES") : "—"}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <form action={adminAdjustLeaguePointsAction} className="space-y-2 rounded-2xl border border-[var(--line)] p-3">
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <input type="hidden" name="league_id" value={id} />
                  <input type="hidden" name="back" value={`/app/admin/leagues/${id}`} />
                  <p className="text-xs font-semibold">± Puntos</p>
                  <input className="input min-h-11" name="delta" type="number" required placeholder="±" />
                  <input className="input min-h-11" name="reason" defaultValue="admin adjust" required />
                  <button type="submit" className="btn-ghost min-h-11 w-full text-xs">
                    Aplicar
                  </button>
                </form>
                <form action={adminSetLeaguePointsAction} className="space-y-2 rounded-2xl border border-[var(--line)] p-3">
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <input type="hidden" name="league_id" value={id} />
                  <input type="hidden" name="back" value={`/app/admin/leagues/${id}`} />
                  <p className="text-xs font-semibold">Fijar puntos</p>
                  <input
                    className="input min-h-11"
                    name="points"
                    type="number"
                    min={0}
                    defaultValue={Number(m.total_points)}
                    required
                  />
                  <input className="input min-h-11" name="reason" defaultValue="admin set" required />
                  <button type="submit" className="btn-ghost min-h-11 w-full text-xs">
                    Establecer
                  </button>
                </form>
              </div>
              <form action={adminLogDrinksForUserAction} className="grid grid-cols-3 gap-2">
                <input type="hidden" name="user_id" value={m.user_id} />
                <input type="hidden" name="back" value={`/app/admin/leagues/${id}`} />
                <input type="hidden" name="venue" value={league.name} />
                <select className="input min-h-11 col-span-2" name="drink_code" defaultValue="cerveza">
                  {(Object.keys(DRINK_LABELS) as DrinkCode[]).map((c) => (
                    <option key={c} value={c}>
                      {DRINK_LABELS[c]}
                    </option>
                  ))}
                </select>
                <input className="input min-h-11" name="quantity" type="number" min={1} defaultValue={1} />
                <button type="submit" className="btn-primary min-h-11 col-span-3 text-sm">
                  + Bebida
                </button>
              </form>
              <form action={kickLeagueMemberAction}>
                <input type="hidden" name="league_id" value={id} />
                <input type="hidden" name="user_id" value={m.user_id} />
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-xl border border-[var(--danger)] text-sm text-[var(--danger)]"
                >
                  Expulsar de la liga
                </button>
              </form>
            </li>
          ),
        )}
      </ul>

      <h2 className="font-display text-2xl">Consumiciones recientes</h2>
      <ul className="space-y-3">
        {(logs ?? []).map((d) => {
          const u = d.users as unknown as { display_name: string } | null;
          return (
            <li key={d.id} className="surface flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{u?.display_name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {d.venue_name_snapshot} · +{d.points_total}
                </p>
              </div>
              <form action={adminVoidDrinkLogAction}>
                <input type="hidden" name="log_id" value={d.id} />
                <input type="hidden" name="league_id" value={id} />
                <button type="submit" className="btn-ghost min-h-11 text-xs text-[var(--danger)]">
                  Borrar
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
