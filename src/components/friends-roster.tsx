import Link from "next/link";
import { RemoveFriendButton } from "@/components/friend-search";
import { xpProgress } from "@/lib/domain";
import { XpBar } from "@/components/ui/xp-bar";

export type FriendCardData = {
  id: string;
  display_name: string;
  friend_code: string | null;
  username: string | null;
  avatar_url: string | null;
  title: string | null;
  level: number;
  xp: number;
  prestige_level?: number | null;
  chemistry_score: number;
  chemistry_tier: string;
  shared_activities: number;
  total_points?: number;
  total_logs?: number;
};

function avatarGlyph(url: string | null | undefined, name: string) {
  if (url?.startsWith("emoji:")) return url.slice(6);
  if (!url) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }
  return null;
}

export function FriendsRoster({ friends }: { friends: FriendCardData[] }) {
  if (!friends.length) {
    return (
      <div className="surface p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--amber)]">Amigos</p>
        <h2 className="mt-1 font-display text-2xl">Tu círculo</h2>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Aún no tienes amigos. Busca por nombre o comparte tu código.
        </p>
      </div>
    );
  }

  const sorted = [...friends].sort(
    (a, b) => b.chemistry_score - a.chemistry_score || b.level - a.level,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--amber)]">Amigos</p>
          <h2 className="font-display text-2xl">Tu círculo · {sorted.length}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Perfiles, niveles y química juntos.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {sorted.map((f) => {
          const progress = xpProgress(Number(f.xp ?? 0));
          const level = Math.max(Number(f.level ?? 1), progress.level);
          const glyph = avatarGlyph(f.avatar_url, f.display_name);
          const href = `/app/u/${encodeURIComponent(f.friend_code || f.username || f.id)}`;
          const score = Math.min(100, Math.max(0, Number(f.chemistry_score ?? 0)));

          return (
            <li key={f.id} className="friend-card">
              <Link href={href} className="friend-card-main">
                <div className="friend-avatar" aria-hidden>
                  {glyph ? (
                    <span className="friend-avatar-glyph">{glyph}</span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.avatar_url!} alt="" className="h-full w-full object-cover" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[10px] uppercase tracking-[0.16em] text-[var(--amber)]">
                        {f.title ?? "Novato"}
                        {f.prestige_level ? ` · P${f.prestige_level}` : ""}
                      </p>
                      <p className="truncate font-display text-xl leading-tight">
                        {f.display_name}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        Nv.{level}
                        {f.friend_code ? ` · ${f.friend_code}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-2xl leading-none text-[var(--teal)]">
                        {score}
                      </p>
                      <p className="text-[10px] text-[var(--muted)]">química</p>
                    </div>
                  </div>

                  <div className="mt-2">
                    <XpBar
                      ratio={progress.ratio}
                      size="sm"
                      accent="amber"
                      label={`${Number(f.xp).toLocaleString("es-ES")} XP`}
                    />
                  </div>

                  <div className="friend-meta">
                    <span>{f.chemistry_tier}</span>
                    <span>{f.shared_activities} actividades</span>
                    {typeof f.total_points === "number" ? (
                      <span>{f.total_points.toLocaleString("es-ES")} pts</span>
                    ) : null}
                    {typeof f.total_logs === "number" ? (
                      <span>{f.total_logs} logs</span>
                    ) : null}
                  </div>
                </div>
              </Link>

              <div className="friend-card-actions">
                <Link href={href} className="btn-ghost min-h-10 flex-1 px-3 text-xs">
                  Ver perfil
                </Link>
                <RemoveFriendButton friendUserId={f.id} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
