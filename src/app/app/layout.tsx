import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { getCurrentProfile } from "@/lib/data";
import { signOut } from "@/app/actions";
import { xpProgress } from "@/lib/domain";
import { isSuperadminRole } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  void Promise.resolve(supabase.rpc("record_app_open")).catch(() => undefined);

  const { count: unread } = await supabase
    .from("activity_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  const progress = xpProgress(Number(profile.xp));
  const isAdmin = isSuperadminRole(profile.role);
  const tokens = Number(profile.token_balance ?? 0);
  const title = profile.title ?? "Novato";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-28 pt-5 sm:px-6 lg:max-w-5xl">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrandMark href="/app" size="sm" />
          <Link
            href="/app"
            className="rounded-full border border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_15%,transparent)] px-3 py-1.5 text-xs font-bold text-[var(--amber)]"
          >
            ← Inicio
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/app/activity"
            className="relative rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-semibold"
            aria-label="Actividad"
          >
            🔔
            {(unread ?? 0) > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[9px] font-bold text-white">
                {(unread ?? 0) > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Link>
          <Link
            href="/app/shop"
            className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--amber)]"
          >
            {tokens.toLocaleString("es-ES")} ★
          </Link>
          <Link href="/app/profile" className="text-right">
            <p className="text-sm font-semibold leading-tight">{profile.display_name}</p>
            <p className="text-[10px] text-[var(--muted)] sm:text-xs">
              {title} · Nv.{progress.level}
            </p>
          </Link>
          <form action={signOut}>
            <button type="submit" className="btn-ghost hidden px-3 py-2 text-xs sm:inline-flex">
              Salir
            </button>
          </form>
        </div>
      </header>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
        <div
          className="h-full rounded-full bg-[var(--amber)] transition-all"
          style={{ width: `${progress.ratio * 100}%` }}
        />
      </div>

      <div className="flex-1 pt-5">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--panel)_94%,transparent)] backdrop-blur-md">
        <div className="mx-auto grid max-w-3xl grid-cols-5 gap-0.5 px-1 py-2 text-center text-[10px] font-semibold sm:text-xs lg:max-w-5xl">
          <Link href="/app" className="nav-link rounded-xl px-0.5 py-2 text-[var(--amber)]">
            Inicio
          </Link>
          <Link href="/app/activity" className="nav-link rounded-xl px-0.5 py-2">
            Actividad
          </Link>
          <Link href="/app/leagues" className="nav-link rounded-xl px-0.5 py-2">
            Ligas
          </Link>
          <Link href="/app/stats" className="nav-link rounded-xl px-0.5 py-2">
            Stats
          </Link>
          <Link
            href={isAdmin ? "/app/admin" : "/app/profile"}
            className="nav-link rounded-xl px-0.5 py-2"
          >
            {isAdmin ? "Admin" : "Yo"}
          </Link>
        </div>
      </nav>
    </div>
  );
}
