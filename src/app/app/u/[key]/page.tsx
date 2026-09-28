import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { xpProgress } from "@/lib/domain";
import { XpBar } from "@/components/ui/xp-bar";

type PublicProfile = {
  id: string;
  display_name: string;
  username: string | null;
  friend_code: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  title: string | null;
  level: number;
  xp: number;
  prestige_level: number | null;
  created_at: string;
  stats: { total_points?: number; total_logs?: number; drink_counts?: Record<string, number> } | null;
  achievements: Array<{ code: string; name: string; emoji: string }>;
  chemistry: Array<{ score: number; friend_name: string }>;
  rivals: Array<{ rival_name: string; score: number }>;
  titles: Array<{ code: string; name: string; emoji: string; temporary?: boolean }>;
  records: Array<{ label: string; value: number }>;
  legacy: Array<{ title: string; emoji: string; occurred_at: string }>;
  leagues: Array<{ id: string; name: string }>;
  leadership: Array<{ period: string; current_count: number; best_count: number }>;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  const { key } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_profile", { p_key: key });
  if (error || !data) notFound();

  const p = data as PublicProfile;
  if (p.id === me.id) redirect("/app/profile");

  const progress = xpProgress(Number(p.xp ?? 0));
  const bestChem = (p.chemistry ?? [])[0];
  const mainRival = (p.rivals ?? [])[0];
  const tempTitle = (p.titles ?? []).find((t) => t.temporary);

  return (
    <section className="animate-rise space-y-5">
      <Link href="/app/social" className="text-sm text-[var(--muted)]">
        ← Social
      </Link>

      <div
        className="relative overflow-hidden rounded-3xl border border-[var(--line)]"
        style={{
          background: p.banner_url
            ? `center/cover url(${p.banner_url})`
            : "linear-gradient(135deg, #1a2e28, #0b1512 55%, #1a2030)",
          minHeight: "9rem",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,16,14,0.92)] to-transparent" />
        <div className="relative flex items-end gap-4 p-5 pt-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[var(--amber)] bg-[rgba(7,16,14,0.85)] font-display text-2xl">
            {p.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar_url} alt="" className="h-full w-full rounded-2xl object-cover" />
            ) : (
              initials(p.display_name)
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--amber)]">
              {tempTitle ? `${tempTitle.emoji} ${tempTitle.name}` : p.title ?? "Novato"}
            </p>
            <h1 className="font-display text-3xl leading-tight">{p.display_name}</h1>
            <p className="text-xs text-[var(--muted)]">
              @{p.username ?? "player"} · Nv.{p.level}
              {p.prestige_level ? ` · Prestigio ${p.prestige_level}` : ""}
            </p>
          </div>
        </div>
      </div>

      <XpBar
        ratio={progress.ratio}
        accent="amber"
        label={`Nv.${progress.level} · ${Number(p.xp).toLocaleString("es-ES")} XP`}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="stat-chip p-3 text-center">
          <p className="text-[10px] text-[var(--muted)]">Puntos</p>
          <p className="font-display text-2xl">{Number(p.stats?.total_points ?? 0)}</p>
        </div>
        <div className="stat-chip p-3 text-center">
          <p className="text-[10px] text-[var(--muted)]">Logs</p>
          <p className="font-display text-2xl">{Number(p.stats?.total_logs ?? 0)}</p>
        </div>
      </div>

      {(p.leagues ?? []).length ? (
        <div className="surface p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Ligas</p>
          <p className="mt-1 font-semibold">{p.leagues.map((l) => l.name).join(" · ")}</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Mejor química</p>
          <p className="mt-1 font-display text-xl">
            {bestChem ? `${bestChem.friend_name} · ${Math.round(bestChem.score)}%` : "—"}
          </p>
        </div>
        <div className="surface p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Rival principal</p>
          <p className="mt-1 font-display text-xl">
            {mainRival ? `${mainRival.rival_name}` : "—"}
          </p>
        </div>
      </div>

      {(p.leadership ?? []).some((l) => l.current_count > 0) ? (
        <div className="surface p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Liderazgo</p>
          <p className="mt-1 text-sm">
            {(p.leadership ?? [])
              .filter((l) => l.current_count > 0)
              .map((l) => `${l.current_count} ${l.period === "week" ? "semanas" : l.period}`)
              .join(" · ")}
          </p>
        </div>
      ) : null}

      {(p.achievements ?? []).length ? (
        <div className="surface p-4">
          <h2 className="font-display text-lg">Logros destacados</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {p.achievements.map((a) => (
              <li
                key={a.code}
                className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
              >
                {a.emoji} {a.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(p.records ?? []).length ? (
        <div className="surface p-4">
          <h2 className="font-display text-lg">Récord principal</h2>
          <p className="mt-2 font-display text-2xl text-[var(--amber)]">
            {p.records[0].label}: {Number(p.records[0].value).toLocaleString("es-ES")}
          </p>
        </div>
      ) : null}

      {(p.legacy ?? []).length ? (
        <div className="surface p-4">
          <h2 className="font-display text-lg">Hitos</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {p.legacy.slice(0, 6).map((e, i) => (
              <li key={i}>
                {e.emoji} {e.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.friend_code ? (
        <p className="text-center text-xs text-[var(--muted)]">
          Código amigo · <span className="tracking-widest text-[var(--amber)]">{p.friend_code}</span>
        </p>
      ) : null}
    </section>
  );
}
