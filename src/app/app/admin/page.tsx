import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSuperadminRole } from "@/lib/errors";
import {
  adminAdjustTokensAction,
  adminDecayChemistryAction,
  adminUpsertShopAction,
  adminCreateBetMarketAction,
  adminCancelBetMarketAction,
  adminUpdateBetMarketAction,
  adminSettleBetMarketAction,
  adminVoidDrinkLogAction,
  adminLogDrinksForUserAction,
} from "@/app/actions";
import { DRINK_LABELS, type DrinkCode } from "@/lib/types";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; tab?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isSuperadminRole(profile.role)) redirect("/app");
  const sp = await searchParams;
  const tab = sp.tab ?? "leagues";

  const supabase = await createClient();
  const [
    { count: usersCount },
    { count: leaguesCount },
    { data: overview },
    { data: users },
    { data: drinks },
    { data: markets },
    { data: audit },
    { data: shop },
    { data: leagues },
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("leagues").select("*", { count: "exact", head: true }),
    supabase.rpc("admin_league_overview"),
    supabase
      .from("users")
      .select("id, email, display_name, status, role, xp, level, token_balance, friend_code, avatar_url")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("drink_logs")
      .select(
        "id, user_id, venue_name_snapshot, consumed_at, points_total, status, users(display_name), drink_log_items(quantity, drink_types(code, name))",
      )
      .eq("status", "active")
      .order("consumed_at", { ascending: false })
      .limit(40),
    supabase
      .from("bet_markets")
      .select("id, league_id, title, status, closes_at, leagues(name), bet_selections(id, label, current_odds)")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("admin_audit_logs")
      .select("id, action, target_type, target_id, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("shop_items").select("id, sku, name, price_tokens").eq("is_active", true).limit(40),
    supabase.from("leagues").select("id, name").eq("status", "active").order("name"),
  ]);

  const tabs = [
    ["leagues", "Ligas"],
    ["users", "Usuarios"],
    ["drinks", "Bebidas"],
    ["bets", "Apuestas"],
    ["shop", "Tienda"],
    ["audit", "Auditoría"],
  ] as const;

  return (
    <section className="animate-rise space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">Panel SuperAdmin</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Control total · {profile.display_name}</p>
      </div>

      {sp.ok ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-4 py-3 text-sm text-[var(--teal)]">
          Acción OK: {sp.ok}
        </p>
      ) : null}
      {sp.error ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">
          {sp.error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface p-5">
          <p className="text-xs text-[var(--muted)]">Usuarios</p>
          <p className="font-display text-3xl">{usersCount ?? 0}</p>
        </div>
        <div className="surface p-5">
          <p className="text-xs text-[var(--muted)]">Ligas</p>
          <p className="font-display text-3xl">{leaguesCount ?? 0}</p>
        </div>
        <div className="surface p-5">
          <p className="text-xs text-[var(--muted)]">Logs activos</p>
          <p className="font-display text-3xl">{drinks?.length ?? 0}</p>
        </div>
        <form action={adminDecayChemistryAction} className="surface p-5">
          <p className="text-xs text-[var(--muted)]">Química</p>
          <button type="submit" className="btn-ghost mt-2 min-h-11 w-full text-xs">
            Decay semanal
          </button>
        </form>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map(([k, label]) => (
          <Link
            key={k}
            href={`/app/admin?tab=${k}`}
            className={`min-h-11 shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${
              tab === k
                ? "bg-[var(--ink)] text-[#0b1512]"
                : "border border-[var(--line)] text-[var(--muted)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "leagues" ? (
        <div className="space-y-3">
          <h2 className="font-display text-2xl">Visión de ligas</h2>
          {(overview ?? []).map((l: {
            league_id: string;
            name: string;
            status: string;
            created_at: string;
            member_count: number;
            total_points: number;
            total_logs: number;
            last_activity: string | null;
          }) => (
            <Link
              key={l.league_id}
              href={`/app/admin/leagues/${l.league_id}`}
              className="surface block space-y-3 p-5 transition active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xl">{l.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {l.status} · creada{" "}
                    {new Date(l.created_at).toLocaleDateString("es-ES")}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[var(--teal)]">Abrir →</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="stat-chip py-2">
                  <p className="text-[10px] text-[var(--muted)]">Users</p>
                  <p className="font-display text-xl">{Number(l.member_count)}</p>
                </div>
                <div className="stat-chip py-2">
                  <p className="text-[10px] text-[var(--muted)]">Puntos</p>
                  <p className="font-display text-xl text-[var(--amber)]">
                    {Number(l.total_points).toLocaleString("es-ES")}
                  </p>
                </div>
                <div className="stat-chip py-2">
                  <p className="text-[10px] text-[var(--muted)]">Bebidas</p>
                  <p className="font-display text-xl">{Number(l.total_logs)}</p>
                </div>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Actividad:{" "}
                {l.last_activity
                  ? new Date(l.last_activity).toLocaleString("es-ES")
                  : "Sin actividad"}
              </p>
            </Link>
          ))}
          {!overview?.length ? (
            <p className="surface p-6 text-center text-sm text-[var(--muted)]">Sin ligas.</p>
          ) : null}
        </div>
      ) : null}

      {tab === "users" ? (
        <div className="space-y-3">
          <h2 className="font-display text-2xl">Usuarios</h2>
          {(users ?? []).map((u) => (
            <Link
              key={u.id}
              href={`/app/admin/users/${u.id}`}
              className="surface flex items-center gap-3 p-4 transition active:scale-[0.99]"
            >
              <div className="avatar-ring flex h-12 w-12 shrink-0 items-center justify-center text-sm font-bold">
                {(u.display_name ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{u.display_name}</p>
                <p className="truncate text-xs text-[var(--muted)]">{u.email}</p>
              </div>
              <div className="text-right text-xs">
                <p className="font-display text-lg">Nv.{u.level}</p>
                <p className="text-[var(--amber)]">{Number(u.token_balance ?? 0)}★</p>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {tab === "drinks" ? (
        <div className="space-y-4">
          <h2 className="font-display text-2xl">Gestión de consumiciones</h2>
          <div className="surface space-y-3 p-5">
            <p className="font-semibold">Añadir bebida a usuario</p>
            <form action={adminLogDrinksForUserAction} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="back" value="/app/admin?tab=drinks" />
              <select className="input min-h-12" name="user_id" required>
                <option value="">Usuario…</option>
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
              <input className="input min-h-12" name="venue" placeholder="Local" defaultValue="Admin" />
              <select className="input min-h-12" name="drink_code" defaultValue="cerveza">
                {(Object.keys(DRINK_LABELS) as DrinkCode[]).map((c) => (
                  <option key={c} value={c}>
                    {DRINK_LABELS[c]}
                  </option>
                ))}
              </select>
              <input className="input min-h-12" name="quantity" type="number" min={1} max={50} defaultValue={1} />
              <button type="submit" className="btn-primary min-h-12 sm:col-span-2">
                Registrar bebida
              </button>
            </form>
          </div>
          <ul className="space-y-3">
            {(drinks ?? []).map((d) => {
              const u = d.users as unknown as { display_name: string } | null;
              const items = (d.drink_log_items ?? []) as unknown as Array<{
                quantity: number;
                drink_types: { code: string; name: string } | null;
              }>;
              return (
                <li key={d.id} className="surface space-y-2 p-4">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold">{u?.display_name ?? "—"}</p>
                      <p className="text-xs text-[var(--muted)]">
                        📍 {d.venue_name_snapshot} ·{" "}
                        {new Date(d.consumed_at).toLocaleString("es-ES")}
                      </p>
                    </div>
                    <p className="font-display text-xl text-[var(--amber)]">+{d.points_total}</p>
                  </div>
                  <p className="text-sm text-[var(--muted)]">
                    {items
                      .map(
                        (i) =>
                          `${DRINK_LABELS[(i.drink_types?.code ?? "") as DrinkCode] ?? i.drink_types?.name} ×${i.quantity}`,
                      )
                      .join(" · ")}
                  </p>
                  <form action={adminVoidDrinkLogAction}>
                    <input type="hidden" name="log_id" value={d.id} />
                    <button
                      type="submit"
                      className="min-h-11 w-full rounded-xl border border-[var(--danger)] text-sm font-semibold text-[var(--danger)]"
                    >
                      Eliminar consumición
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {tab === "bets" ? (
        <div className="space-y-4">
          <h2 className="font-display text-2xl">Gestión de apuestas</h2>
          <div className="surface space-y-3 p-5">
            <p className="font-semibold">Crear mercado</p>
            <form action={adminCreateBetMarketAction} className="grid gap-2">
              <input type="hidden" name="back" value="/app/admin?tab=bets" />
              <select className="input min-h-12" name="league_id" required>
                <option value="">Liga…</option>
                {(leagues ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <input className="input min-h-12" name="title" placeholder="Título del mercado" required />
              <div className="grid grid-cols-2 gap-2">
                <input className="input min-h-12" name="sel_a" placeholder="Opción A" defaultValue="Sí" />
                <input className="input min-h-12" name="odds_a" type="number" step="0.1" defaultValue={2} />
                <input className="input min-h-12" name="sel_b" placeholder="Opción B" defaultValue="No" />
                <input className="input min-h-12" name="odds_b" type="number" step="0.1" defaultValue={2} />
              </div>
              <button type="submit" className="btn-primary min-h-12">
                Crear mercado
              </button>
            </form>
          </div>
          <ul className="space-y-3">
            {(markets ?? []).map((m) => {
              const league = m.leagues as unknown as { name: string } | null;
              const sels = (m.bet_selections ?? []) as Array<{
                id: string;
                label: string;
                current_odds: number;
              }>;
              return (
                <li key={m.id} className="surface space-y-3 p-4">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold">{m.title}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {league?.name} · {m.status}
                      </p>
                    </div>
                  </div>
                  {m.status === "open" || m.status === "closed" ? (
                    <>
                      <form action={adminSettleBetMarketAction} className="space-y-2">
                        <input type="hidden" name="market_id" value={m.id} />
                        <input type="hidden" name="back" value="/app/admin?tab=bets" />
                        <select className="input min-h-12" name="winning_selection_id" required>
                          <option value="">Resolver con…</option>
                          {sels.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label} ({Number(s.current_odds).toFixed(2)})
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn-primary min-h-11 w-full text-sm">
                          Resolver
                        </button>
                      </form>
                      <form action={adminUpdateBetMarketAction} className="grid grid-cols-2 gap-2">
                        <input type="hidden" name="market_id" value={m.id} />
                        <input type="hidden" name="back" value="/app/admin?tab=bets" />
                        <input type="hidden" name="reason" value="admin edit" />
                        <input className="input min-h-11" name="title" defaultValue={m.title} />
                        <select className="input min-h-11" name="status" defaultValue={m.status}>
                          <option value="open">open</option>
                          <option value="closed">closed</option>
                        </select>
                        <button type="submit" className="btn-ghost min-h-11 col-span-2 text-sm">
                          Guardar cambios
                        </button>
                      </form>
                      <form action={adminCancelBetMarketAction}>
                        <input type="hidden" name="market_id" value={m.id} />
                        <input type="hidden" name="reason" value="admin cancel" />
                        <input type="hidden" name="back" value="/app/admin?tab=bets" />
                        <button
                          type="submit"
                          className="min-h-11 w-full rounded-xl border border-[var(--danger)] text-sm font-semibold text-[var(--danger)]"
                        >
                          Cancelar y reembolsar
                        </button>
                      </form>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {tab === "shop" ? (
        <div className="space-y-4">
          <div className="surface p-5">
            <h2 className="font-display text-xl">Producto</h2>
            <form action={adminUpsertShopAction} className="mt-3 grid gap-2">
              <input className="input min-h-12" name="sku" placeholder="sku" required />
              <input className="input min-h-12" name="name" placeholder="nombre" required />
              <input className="input min-h-12" name="category" defaultValue="frame" />
              <input className="input min-h-12" name="tier" defaultValue="common" />
              <input className="input min-h-12" name="price" type="number" placeholder="precio" required />
              <input className="input min-h-12" name="description" placeholder="descripción" />
              <button type="submit" className="btn-primary min-h-12">
                Guardar
              </button>
            </form>
          </div>
          <div className="surface p-5">
            <p className="font-semibold">Ajuste rápido de fichas</p>
            <form action={adminAdjustTokensAction} className="mt-2 grid gap-2">
              <select className="input min-h-12" name="user_id" required>
                <option value="">Usuario…</option>
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
              <input className="input min-h-12" name="delta" type="number" placeholder="± fichas" required />
              <input className="input min-h-12" name="reason" placeholder="motivo" required />
              <button className="btn-primary min-h-12" type="submit">
                Ajustar fichas
              </button>
            </form>
          </div>
          <ul className="space-y-2 text-sm text-[var(--muted)]">
            {(shop ?? []).map((i) => (
              <li key={i.id} className="surface px-4 py-3">
                {i.name} · {i.sku} · {i.price_tokens}★
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="space-y-3">
          <h2 className="font-display text-2xl">Auditoría</h2>
          {(audit ?? []).map((a) => (
            <div key={a.id} className="surface p-4 text-sm">
              <p className="font-semibold">{a.action}</p>
              <p className="text-[var(--muted)]">
                {a.target_type} {a.target_id ? `· ${a.target_id}` : ""} · {a.reason ?? "—"}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {new Date(a.created_at).toLocaleString("es-ES")}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
