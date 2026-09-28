import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSuperadminRole } from "@/lib/errors";
import {
  adminAdjustTokensAction,
  adminAdjustXpAction,
  adminSetXpAction,
  adminAdjustLevelAction,
  adminSetStatusAction,
  adminGiftItemAction,
  adminGrantTitleAction,
  adminGrantTrophyAction,
  adminRevokeTitleAction,
  adminRevokeTrophyAction,
  adminGrantAchievementAction,
  adminRevokeAchievementAction,
  adminLogDrinksForUserAction,
  adminAdjustLeaguePointsAction,
  adminSetLeaguePointsAction,
} from "@/app/actions";
import { DRINK_LABELS, type DrinkCode } from "@/lib/types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function AdminUserPage({
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
  const back = `/app/admin/users/${id}`;

  const [
    { data: user },
    { data: stats },
    { data: memberships },
    { data: titles },
    { data: trophies },
    { data: achievements },
    { data: allTitles },
    { data: allTrophies },
    { data: allAchievements },
    { data: shop },
  ] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, email, display_name, status, role, xp, level, token_balance, friend_code, title, equipped_title_code",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("user_stats_global").select("*").eq("user_id", id).maybeSingle(),
    supabase
      .from("league_memberships")
      .select("league_id, role, status, leagues(name), league_member_stats(total_points, total_logs)")
      .eq("user_id", id)
      .eq("status", "active"),
    supabase
      .from("user_titles")
      .select("title_code, title_definitions(name, emoji)")
      .eq("user_id", id),
    supabase
      .from("user_trophies")
      .select("id, trophy_code, trophy_definitions(name, icon)")
      .eq("user_id", id),
    supabase
      .from("user_achievements")
      .select("achievement_code, achievement_definitions(name)")
      .eq("user_id", id)
      .is("league_id", null)
      .limit(40),
    supabase.from("title_definitions").select("code, name").order("name"),
    supabase.from("trophy_definitions").select("code, name").order("name"),
    supabase.from("achievement_definitions").select("code, name").eq("is_active", true).order("name").limit(80),
    supabase.from("shop_items").select("id, name").eq("is_active", true).limit(40),
  ]);

  if (!user) notFound();

  return (
    <section className="animate-rise space-y-6">
      <div>
        <Link href="/app/admin?tab=users" className="text-sm text-[var(--muted)]">
          ← Usuarios
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <div className="avatar-ring flex h-16 w-16 items-center justify-center font-display text-xl">
            {initials(user.display_name)}
          </div>
          <div>
            <h1 className="font-display text-3xl">{user.display_name}</h1>
            <p className="text-sm text-[var(--muted)]">{user.email}</p>
            <p className="text-xs text-[var(--muted)]">
              Nv.{user.level} · {user.xp} XP · {Number(user.token_balance ?? 0)}★ · {user.status}
            </p>
          </div>
        </div>
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

      <div className="grid grid-cols-3 gap-3">
        <div className="stat-chip text-center">
          <p className="text-[10px] text-[var(--muted)]">Puntos</p>
          <p className="font-display text-2xl">{stats?.total_points ?? 0}</p>
        </div>
        <div className="stat-chip text-center">
          <p className="text-[10px] text-[var(--muted)]">Bebidas</p>
          <p className="font-display text-2xl">{stats?.total_logs ?? 0}</p>
        </div>
        <div className="stat-chip text-center">
          <p className="text-[10px] text-[var(--muted)]">Código</p>
          <p className="font-display text-lg">{user.friend_code}</p>
        </div>
      </div>

      {/* Bebidas */}
      <div className="surface space-y-3 p-5">
        <h2 className="font-display text-xl">🍺 Bebidas</h2>
        <form action={adminLogDrinksForUserAction} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="back" value={back} />
          <input className="input min-h-12" name="venue" defaultValue="Admin" />
          <select className="input min-h-12" name="drink_code" defaultValue="cerveza">
            {(Object.keys(DRINK_LABELS) as DrinkCode[]).map((c) => (
              <option key={c} value={c}>
                {DRINK_LABELS[c]}
              </option>
            ))}
          </select>
          <input className="input min-h-12" name="quantity" type="number" min={1} defaultValue={1} />
          <button type="submit" className="btn-primary min-h-12">
            Añadir bebida
          </button>
        </form>
        <p className="text-xs text-[var(--muted)]">
          Para quitar: ve a Admin → Bebidas o elimina el log concreto.
        </p>
      </div>

      {/* Puntos por liga */}
      <div className="surface space-y-4 p-5">
        <h2 className="font-display text-xl">Puntos / clasificaciones</h2>
        {(memberships ?? []).map((m) => {
          const league = m.leagues as unknown as { name: string } | null;
          const st = m.league_member_stats as unknown as
            | { total_points: number; total_logs: number }
            | { total_points: number; total_logs: number }[]
            | null;
          const points = Array.isArray(st) ? st[0]?.total_points : st?.total_points;
          return (
            <div key={m.league_id} className="rounded-2xl border border-[var(--line)] p-3 space-y-2">
              <p className="font-semibold">
                {league?.name ?? m.league_id} · {Number(points ?? 0)} pts
              </p>
              <form action={adminAdjustLeaguePointsAction} className="grid grid-cols-2 gap-2">
                <input type="hidden" name="user_id" value={id} />
                <input type="hidden" name="league_id" value={m.league_id} />
                <input type="hidden" name="back" value={back} />
                <input className="input min-h-11" name="delta" type="number" placeholder="± puntos" required />
                <input className="input min-h-11" name="reason" defaultValue="admin" required />
                <button type="submit" className="btn-ghost min-h-11 col-span-2 text-sm">
                  ± Puntos
                </button>
              </form>
              <form action={adminSetLeaguePointsAction} className="grid grid-cols-2 gap-2">
                <input type="hidden" name="user_id" value={id} />
                <input type="hidden" name="league_id" value={m.league_id} />
                <input type="hidden" name="back" value={back} />
                <input
                  className="input min-h-11"
                  name="points"
                  type="number"
                  min={0}
                  defaultValue={Number(points ?? 0)}
                  required
                />
                <input className="input min-h-11" name="reason" defaultValue="set" required />
                <button type="submit" className="btn-ghost min-h-11 col-span-2 text-sm">
                  Establecer puntos
                </button>
              </form>
            </div>
          );
        })}
        {!memberships?.length ? (
          <p className="text-sm text-[var(--muted)]">Sin ligas activas.</p>
        ) : null}
      </div>

      {/* XP / nivel / fichas */}
      <div className="surface grid gap-4 p-5 sm:grid-cols-2">
        <form action={adminAdjustXpAction} className="space-y-2">
          <p className="font-semibold">± XP</p>
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="back" value={back} />
          <input className="input min-h-12" name="delta" type="number" required />
          <input className="input min-h-12" name="reason" defaultValue="admin xp" required />
          <button className="btn-primary min-h-12 w-full" type="submit">
            Aplicar XP
          </button>
        </form>
        <form action={adminSetXpAction} className="space-y-2">
          <p className="font-semibold">Fijar XP</p>
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="back" value={back} />
          <input className="input min-h-12" name="xp" type="number" min={0} defaultValue={Number(user.xp)} required />
          <input className="input min-h-12" name="reason" defaultValue="set xp" required />
          <button className="btn-primary min-h-12 w-full" type="submit">
            Establecer XP
          </button>
        </form>
        <form action={adminAdjustLevelAction} className="space-y-2">
          <p className="font-semibold">± Niveles</p>
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="back" value={back} />
          <input className="input min-h-12" name="delta" type="number" required placeholder="+1 / -1" />
          <input className="input min-h-12" name="reason" defaultValue="level" required />
          <button className="btn-primary min-h-12 w-full" type="submit">
            Cambiar nivel
          </button>
        </form>
        <form action={adminAdjustTokensAction} className="space-y-2">
          <p className="font-semibold">± Fichas</p>
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="back" value={back} />
          <input className="input min-h-12" name="delta" type="number" required />
          <input className="input min-h-12" name="reason" defaultValue="admin tokens" required />
          <button className="btn-primary min-h-12 w-full" type="submit">
            Ajustar fichas
          </button>
        </form>
        <form action={adminSetStatusAction} className="space-y-2 sm:col-span-2">
          <p className="font-semibold">Estado</p>
          <input type="hidden" name="user_id" value={id} />
          <select className="input min-h-12" name="status" defaultValue={user.status}>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="deleted">deleted</option>
          </select>
          <input className="input min-h-12" name="reason" defaultValue="status" required />
          <button className="btn-ghost min-h-12 w-full" type="submit">
            Cambiar estado
          </button>
        </form>
      </div>

      {/* Logros / títulos / trofeos */}
      <div className="surface space-y-4 p-5">
        <h2 className="font-display text-xl">Logros · Títulos · Trofeos</h2>
        <form action={adminGrantAchievementAction} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="reason" value="grant" />
          <select className="input min-h-12" name="achievement_code" required>
            {(allAchievements ?? []).map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary min-h-12">
            Añadir logro
          </button>
        </form>
        <ul className="space-y-2">
          {(achievements ?? []).map((a) => {
            const def = a.achievement_definitions as unknown as { name: string } | null;
            return (
              <li key={a.achievement_code} className="flex items-center justify-between gap-2 text-sm">
                <span>{def?.name ?? a.achievement_code}</span>
                <form action={adminRevokeAchievementAction}>
                  <input type="hidden" name="user_id" value={id} />
                  <input type="hidden" name="achievement_code" value={a.achievement_code} />
                  <input type="hidden" name="reason" value="revoke" />
                  <input type="hidden" name="back" value={back} />
                  <button type="submit" className="text-[var(--danger)]">
                    Quitar
                  </button>
                </form>
              </li>
            );
          })}
        </ul>

        <form action={adminGrantTitleAction} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="reason" value="grant" />
          <select className="input min-h-12" name="title_code" required>
            {(allTitles ?? []).map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary min-h-12">
            Añadir título
          </button>
        </form>
        <ul className="space-y-2">
          {(titles ?? []).map((t) => {
            const def = t.title_definitions as unknown as { name: string; emoji: string } | null;
            return (
              <li key={t.title_code} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {def?.emoji} {def?.name ?? t.title_code}
                </span>
                <form action={adminRevokeTitleAction}>
                  <input type="hidden" name="user_id" value={id} />
                  <input type="hidden" name="title_code" value={t.title_code} />
                  <input type="hidden" name="reason" value="revoke" />
                  <input type="hidden" name="back" value={back} />
                  <button type="submit" className="text-[var(--danger)]">
                    Quitar
                  </button>
                </form>
              </li>
            );
          })}
        </ul>

        <form action={adminGrantTrophyAction} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="reason" value="grant" />
          <select className="input min-h-12" name="trophy_code" required>
            {(allTrophies ?? []).map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary min-h-12">
            Añadir trofeo
          </button>
        </form>
        <ul className="space-y-2">
          {(trophies ?? []).map((t) => {
            const def = t.trophy_definitions as unknown as { name: string; icon: string } | null;
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {def?.icon} {def?.name ?? t.trophy_code}
                </span>
                <form action={adminRevokeTrophyAction}>
                  <input type="hidden" name="user_id" value={id} />
                  <input type="hidden" name="trophy_id" value={t.id} />
                  <input type="hidden" name="reason" value="revoke" />
                  <input type="hidden" name="back" value={back} />
                  <button type="submit" className="text-[var(--danger)]">
                    Quitar
                  </button>
                </form>
              </li>
            );
          })}
        </ul>

        <form action={adminGiftItemAction} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="user_id" value={id} />
          <input type="hidden" name="reason" value="gift" />
          <select className="input min-h-12" name="item_id" required>
            {(shop ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-ghost min-h-12">
            Regalar cosmético
          </button>
        </form>
      </div>
    </section>
  );
}
