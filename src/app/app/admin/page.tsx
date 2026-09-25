import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSuperadminRole } from "@/lib/errors";
import {
  adminAdjustTokensAction,
  adminAdjustXpAction,
  adminSetStatusAction,
  adminGiftItemAction,
  adminGrantTitleAction,
  adminGrantTrophyAction,
  adminUpsertShopAction,
  adminDecayChemistryAction,
} from "@/app/actions";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; tab?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isSuperadminRole(profile.role)) redirect("/app");
  const sp = await searchParams;
  const tab = sp.tab ?? "users";

  const supabase = await createClient();
  const [
    { count: usersCount },
    { count: leaguesCount },
    { data: users },
    { data: leagues },
    { data: audit },
    { data: shop },
    { data: titles },
    { data: trophies },
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("leagues").select("*", { count: "exact", head: true }),
    supabase
      .from("users")
      .select("id, email, display_name, status, role, xp, level, token_balance, friend_code")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("leagues")
      .select("id, name, status, timezone, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("admin_audit_logs")
      .select("id, action, target_type, target_id, reason, created_at, admin_user_id, target_user_id, payload")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("shop_items").select("id, sku, name, price_tokens").eq("is_active", true).limit(40),
    supabase.from("title_definitions").select("code, name").order("name"),
    supabase.from("trophy_definitions").select("code, name").order("name"),
  ]);

  const tabs = [
    ["users", "Usuarios"],
    ["leagues", "Ligas"],
    ["shop", "Tienda"],
    ["audit", "Auditoría"],
  ] as const;

  return (
    <section className="animate-rise space-y-6">
      <div>
        <h1 className="font-display text-3xl">Superadmin</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Control total · {profile.email} · angelnuunoo
        </p>
      </div>

      {sp.ok ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          Acción OK: {sp.ok}
        </p>
      ) : null}
      {sp.error ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
          {sp.error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface p-4">
          <p className="text-xs text-[var(--muted)]">Usuarios</p>
          <p className="font-display text-3xl">{usersCount ?? 0}</p>
        </div>
        <div className="surface p-4">
          <p className="text-xs text-[var(--muted)]">Ligas</p>
          <p className="font-display text-3xl">{leaguesCount ?? 0}</p>
        </div>
        <form action={adminDecayChemistryAction} className="surface p-4">
          <p className="text-xs text-[var(--muted)]">Química</p>
          <button type="submit" className="mt-2 btn-ghost text-xs">
            Aplicar decay semanal
          </button>
        </form>
        <Link href="/app/shop" className="surface p-4">
          <p className="text-xs text-[var(--muted)]">Ir a</p>
          <p className="font-display text-xl">Tienda live</p>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <Link
            key={k}
            href={`/app/admin?tab=${k}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === k ? "bg-[var(--ink)] text-[#0b1512]" : "border border-[var(--line)] text-[var(--muted)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "users" ? (
        <div className="space-y-4">
          <div className="surface p-5">
            <h2 className="font-display text-xl">Operaciones usuario</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <form action={adminAdjustTokensAction} className="space-y-2">
                <p className="text-sm font-semibold">Fichas ±</p>
                <input className="input" name="user_id" placeholder="user uuid" required />
                <input className="input" name="delta" type="number" placeholder="delta" required />
                <input className="input" name="reason" placeholder="motivo" required />
                <button className="btn-primary text-sm" type="submit">
                  Ajustar fichas
                </button>
              </form>
              <form action={adminAdjustXpAction} className="space-y-2">
                <p className="text-sm font-semibold">XP ±</p>
                <input className="input" name="user_id" placeholder="user uuid" required />
                <input className="input" name="delta" type="number" placeholder="delta" required />
                <input className="input" name="reason" placeholder="motivo" required />
                <button className="btn-primary text-sm" type="submit">
                  Ajustar XP
                </button>
              </form>
              <form action={adminSetStatusAction} className="space-y-2">
                <p className="text-sm font-semibold">Estado</p>
                <input className="input" name="user_id" placeholder="user uuid" required />
                <select className="input" name="status" defaultValue="active">
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="deleted">deleted</option>
                </select>
                <input className="input" name="reason" placeholder="motivo" required />
                <button className="btn-primary text-sm" type="submit">
                  Cambiar estado
                </button>
              </form>
              <form action={adminGiftItemAction} className="space-y-2">
                <p className="text-sm font-semibold">Regalar cosmético</p>
                <input className="input" name="user_id" placeholder="user uuid" required />
                <select className="input" name="item_id" required>
                  {(shop ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.price_tokens})
                    </option>
                  ))}
                </select>
                <input className="input" name="reason" placeholder="motivo" required />
                <button className="btn-primary text-sm" type="submit">
                  Regalar
                </button>
              </form>
              <form action={adminGrantTitleAction} className="space-y-2">
                <p className="text-sm font-semibold">Otorgar título</p>
                <input className="input" name="user_id" placeholder="user uuid" required />
                <select className="input" name="title_code" required>
                  {(titles ?? []).map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input className="input" name="reason" placeholder="motivo" required />
                <button className="btn-primary text-sm" type="submit">
                  Otorgar
                </button>
              </form>
              <form action={adminGrantTrophyAction} className="space-y-2">
                <p className="text-sm font-semibold">Otorgar trofeo</p>
                <input className="input" name="user_id" placeholder="user uuid" required />
                <select className="input" name="trophy_code" required>
                  {(trophies ?? []).map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input className="input" name="reason" placeholder="motivo" required />
                <button className="btn-primary text-sm" type="submit">
                  Otorgar
                </button>
              </form>
            </div>
          </div>

          <div className="surface overflow-hidden">
            <h2 className="border-b border-[var(--line)] px-5 py-4 font-display text-xl">Usuarios</h2>
            <ul className="divide-y divide-[var(--line)]">
              {(users ?? []).map((u) => (
                <li key={u.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{u.display_name}</p>
                      <p className="text-[var(--muted)]">{u.email}</p>
                      <p className="mt-1 break-all font-mono text-[10px] text-[var(--muted)]">{u.id}</p>
                    </div>
                    <div className="text-right text-xs text-[var(--muted)]">
                      <p>
                        {u.status} · Nv.{u.level} · {Number(u.token_balance ?? 0)}★
                      </p>
                      <p>{u.friend_code}</p>
                      {isSuperadminRole(u.role) ? <p className="text-[var(--amber)]">superadmin</p> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "leagues" ? (
        <div className="surface overflow-hidden">
          <h2 className="border-b border-[var(--line)] px-5 py-4 font-display text-xl">Ligas</h2>
          <ul className="divide-y divide-[var(--line)]">
            {(leagues ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-[var(--muted)]">
                    {l.status} · {l.timezone}
                  </p>
                </div>
                <Link href={`/app/leagues/${l.id}`} className="text-[var(--teal)]">
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "shop" ? (
        <div className="surface p-5">
          <h2 className="font-display text-xl">Crear / actualizar producto</h2>
          <form action={adminUpsertShopAction} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input className="input" name="sku" placeholder="sku" required />
            <input className="input" name="name" placeholder="nombre" required />
            <input className="input" name="category" placeholder="category" defaultValue="frame" />
            <input className="input" name="tier" placeholder="tier" defaultValue="common" />
            <input className="input" name="price" type="number" placeholder="precio fichas" required />
            <input className="input" name="description" placeholder="descripción" />
            <button type="submit" className="btn-primary sm:col-span-2">
              Guardar producto
            </button>
          </form>
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="surface overflow-hidden">
          <h2 className="border-b border-[var(--line)] px-5 py-4 font-display text-xl">
            Auditoría administrativa
          </h2>
          <ul className="divide-y divide-[var(--line)]">
            {(audit ?? []).map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <p className="font-semibold">{a.action}</p>
                <p className="text-[var(--muted)]">
                  {a.target_type} {a.target_id ? `· ${a.target_id}` : ""} · {a.reason ?? "—"}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {new Date(a.created_at).toLocaleString("es-ES")}
                </p>
              </li>
            ))}
            {!audit?.length ? (
              <li className="px-5 py-4 text-[var(--muted)]">Sin acciones registradas aún.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
