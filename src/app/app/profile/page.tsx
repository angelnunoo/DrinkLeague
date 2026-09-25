import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { ProfileEditor } from "@/components/profile-editor";
import { createClient } from "@/lib/supabase/server";
import {
  equipTitleAction,
  setTrophyShowcaseAction,
  refreshPersonalitiesAction,
} from "@/app/actions";
import { xpProgress } from "@/lib/domain";
import { XpBar } from "@/components/ui/xp-bar";
import { StreakStrip } from "@/components/ui/streak-strip";
import { PrestigeButton } from "@/components/prestige-button";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; showcase?: string; persona?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;
  const progress = xpProgress(Number(profile.xp));

  const supabase = await createClient();
  await supabase.rpc("refresh_user_streaks", { p_user_id: profile.id });

  const [
    { data: stats },
    { data: achievements },
    { data: titles },
    { data: trophies },
    { data: showcase },
    { data: personalities },
    { data: chemistry },
    { data: medals },
    { data: streakRows },
  ] = await Promise.all([
    supabase.from("user_stats_global").select("*").eq("user_id", profile.id).maybeSingle(),
    supabase
      .from("user_achievements")
      .select("achievement_code, unlocked_at, achievement_definitions(name, description)")
      .eq("user_id", profile.id)
      .order("unlocked_at", { ascending: false })
      .limit(8),
    supabase
      .from("user_titles")
      .select("title_code, unlocked_at, title_definitions(name, emoji, rarity, description)")
      .eq("user_id", profile.id),
    supabase
      .from("user_trophies")
      .select("id, trophy_code, unlocked_at, trophy_definitions(name, icon, rarity, description)")
      .eq("user_id", profile.id)
      .order("unlocked_at", { ascending: false }),
    supabase
      .from("trophy_showcase")
      .select("slot, user_trophy_id")
      .eq("user_id", profile.id)
      .order("slot"),
    supabase
      .from("user_personalities")
      .select("personality_code, score, is_primary, personality_definitions(name, emoji, description)")
      .eq("user_id", profile.id)
      .order("score", { ascending: false }),
    supabase
      .from("friendships")
      .select("chemistry_score, chemistry_level, user_a, user_b")
      .or(`user_a.eq.${profile.id},user_b.eq.${profile.id}`)
      .order("chemistry_score", { ascending: false })
      .limit(3),
    supabase.from("user_medals").select("place").eq("user_id", profile.id),
    supabase.from("user_streaks").select("streak_type, current_count").eq("user_id", profile.id),
  ]);

  const showMap = new Map((showcase ?? []).map((s) => [s.slot, s.user_trophy_id]));
  const friendIds = [
    ...new Set(
      (chemistry ?? []).flatMap((c) => [c.user_a, c.user_b]).filter((id) => id !== profile.id),
    ),
  ];
  const { data: friendUsers } = friendIds.length
    ? await supabase.from("users").select("id, display_name").in("id", friendIds)
    : { data: [] };
  const fname = new Map((friendUsers ?? []).map((u) => [u.id, u.display_name]));

  const primaryPersona = (personalities ?? []).find((p) => p.is_primary) ?? (personalities ?? [])[0];
  const personaDef = primaryPersona?.personality_definitions as unknown as {
    name: string;
    emoji: string;
  } | null;

  return (
    <section className="animate-rise space-y-5">
      {/* Avatar card — FIFA / Brawl style */}
      <div
        className="relative overflow-hidden rounded-3xl border border-[var(--line)] p-5"
        style={{
          background:
            "linear-gradient(145deg, rgba(45,212,191,0.2), rgba(240,162,2,0.14)), radial-gradient(500px 220px at 100% 0%, rgba(255,213,106,0.28), transparent)",
        }}
      >
        <div className="flex items-center gap-4">
          <div className="avatar-ring avatar-ring-gold flex h-20 w-20 shrink-0 items-center justify-center font-display text-2xl">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials(profile.display_name)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Perfil</p>
            <h1 className="truncate font-display text-3xl text-[var(--ink-strong)]">
              {profile.display_name}
            </h1>
            <p className="text-[var(--amber)]">
              {profile.title ?? "Novato"}
              {personaDef ? ` · ${personaDef.emoji} ${personaDef.name}` : ""}
              {profile.prestige_level
                ? ` · 👑 Prestigio ${["", "I", "II", "III", "IV", "V"][Math.min(profile.prestige_level, 5)]}`
                : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="stat-chip text-center">
            <p className="text-[9px] uppercase text-[var(--muted)]">Nivel</p>
            <p className="font-display text-2xl">{progress.level}</p>
          </div>
          <div className="stat-chip text-center">
            <p className="text-[9px] uppercase text-[var(--muted)]">Fichas</p>
            <p className="font-display text-2xl text-[var(--amber)]">
              {Number(profile.token_balance ?? 0).toLocaleString("es-ES")}
            </p>
          </div>
          <div className="stat-chip text-center">
            <p className="text-[9px] uppercase text-[var(--muted)]">Puntos</p>
            <p className="font-display text-2xl">{stats?.total_points ?? 0}</p>
          </div>
        </div>

        <div className="mt-4">
          <XpBar ratio={progress.ratio} size="md" accent="teal" label={`${profile.xp} XP`} />
        </div>
      </div>

      <StreakStrip streaks={streakRows ?? []} />

      <div className="surface p-4">
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Medallas</p>
        <div className="mt-2 flex gap-4 font-display text-3xl">
          <span>🥇 {(medals ?? []).filter((m) => m.place === 1).length}</span>
          <span>🥈 {(medals ?? []).filter((m) => m.place === 2).length}</span>
          <span>🥉 {(medals ?? []).filter((m) => m.place === 3).length}</span>
        </div>
      </div>

      {progress.level >= 100 ? (
        <div className="premium-banner p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
            Prestigio
          </p>
          <p className="mt-1 font-display text-2xl">Nivel máximo alcanzado</p>
          <p className="text-sm text-[var(--muted)]">
            Reinicia el nivel, conserva logros, trofeos e historial. Cosmético exclusivo.
          </p>
          <div className="mt-3">
            <PrestigeButton />
          </div>
        </div>
      ) : null}

      {sp.title || sp.showcase || sp.persona ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          Perfil actualizado.
        </p>
      ) : null}

      {/* Season summary */}
      <div className="surface p-4">
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Resumen de temporada
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="stat-chip">
            <p className="text-xs text-[var(--muted)]">Registros</p>
            <p className="font-display text-2xl">{stats?.total_logs ?? 0}</p>
          </div>
          <div className="stat-chip">
            <p className="text-xs text-[var(--muted)]">Logros</p>
            <p className="font-display text-2xl">{achievements?.length ?? 0}</p>
          </div>
          <div className="stat-chip">
            <p className="text-xs text-[var(--muted)]">Trofeos</p>
            <p className="font-display text-2xl">{trophies?.length ?? 0}</p>
          </div>
          <div className="stat-chip">
            <p className="text-xs text-[var(--muted)]">Títulos</p>
            <p className="font-display text-2xl">{titles?.length ?? 0}</p>
          </div>
        </div>
        <Link href="/app/battle-pass" className="btn-ghost mt-3 w-full text-sm">
          Ver pase de temporada →
        </Link>
      </div>

      {/* Featured trophies */}
      <div className="surface p-4">
        <h2 className="font-display text-xl">Trofeos destacados</h2>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => {
            const slot = i + 1;
            const tid = showMap.get(slot);
            const trophy = (trophies ?? []).find((t) => t.id === tid);
            const def = trophy?.trophy_definitions as unknown as {
              name: string;
              icon: string;
            } | null;
            return (
              <div
                key={slot}
                className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-[rgba(7,16,14,0.55)] p-1.5 text-center"
              >
                <span className="text-2xl">{def?.icon ?? "◇"}</span>
                <span className="mt-1 line-clamp-2 text-[9px] text-[var(--muted)]">
                  {def?.name ?? `Slot ${slot}`}
                </span>
              </div>
            );
          })}
        </div>
        {(trophies ?? []).length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(trophies ?? []).slice(0, 8).map((t) => {
              const def = t.trophy_definitions as unknown as { name: string; icon: string } | null;
              return (
                <form key={t.id} action={setTrophyShowcaseAction.bind(null, 1, t.id)}>
                  <button type="submit" className="btn-ghost px-2 py-1 text-[10px]">
                    {def?.icon} →1
                  </button>
                </form>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">Gana guerras y MVPs para llenar la vitrina.</p>
        )}
      </div>

      {/* Achievements highlight */}
      <div className="surface p-4">
        <h2 className="font-display text-xl">Logros destacados</h2>
        <div className="mt-3 grid gap-2">
          {(achievements ?? []).slice(0, 4).map((a) => {
            const def = a.achievement_definitions as unknown as {
              name: string;
              description: string;
            } | null;
            return (
              <div key={`${a.achievement_code}-${a.unlocked_at}`} className="stat-chip">
                <p className="font-semibold">{def?.name ?? a.achievement_code}</p>
                <p className="text-xs text-[var(--muted)]">{def?.description}</p>
              </div>
            );
          })}
          {!achievements?.length ? (
            <p className="text-sm text-[var(--muted)]">Sigue registrando para desbloquear logros.</p>
          ) : null}
        </div>
      </div>

      {/* Chemistry */}
      <div className="surface p-4">
        <h2 className="font-display text-xl">Química destacada</h2>
        <ul className="mt-3 space-y-2">
          {(chemistry ?? []).map((c) => {
            const other = c.user_a === profile.id ? c.user_b : c.user_a;
            return (
              <li key={`${c.user_a}-${c.user_b}`} className="rank-row flex items-center gap-3 px-3 py-2.5">
                <div className="avatar-ring flex h-9 w-9 items-center justify-center text-xs font-bold">
                  {initials(fname.get(other) ?? "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{fname.get(other) ?? "Amigo"}</p>
                  <p className="text-[10px] text-[var(--muted)]">Nivel {c.chemistry_level}</p>
                </div>
                <span className="font-display text-xl text-[var(--teal)]">
                  {Math.round(Number(c.chemistry_score))}%
                </span>
              </li>
            );
          })}
          {!chemistry?.length ? (
            <li className="text-sm text-[var(--muted)]">
              Añade amigos en Social para construir química.
            </li>
          ) : null}
        </ul>
        <Link href="/app/social" className="btn-ghost mt-3 w-full text-sm">
          Ir a Social
        </Link>
      </div>

      {/* Titles */}
      <div className="surface p-4">
        <h2 className="font-display text-xl">Títulos</h2>
        <ul className="mt-3 space-y-2">
          {(titles ?? []).map((t) => {
            const def = t.title_definitions as unknown as {
              name: string;
              emoji: string;
              rarity: string;
            } | null;
            const equipped = profile.equipped_title_code === t.title_code;
            return (
              <li key={t.title_code} className="rank-row flex items-center justify-between gap-2 px-3 py-2.5">
                <div>
                  <p className="font-semibold">
                    {def?.emoji} {def?.name ?? t.title_code}
                  </p>
                  <p className="text-[10px] capitalize text-[var(--muted)]">{def?.rarity}</p>
                </div>
                {equipped ? (
                  <span className="text-xs text-[var(--teal)]">Equipado</span>
                ) : (
                  <form action={equipTitleAction.bind(null, t.title_code)}>
                    <button type="submit" className="btn-ghost text-xs">
                      Equipar
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Personalidad</h2>
          <form action={refreshPersonalitiesAction}>
            <button type="submit" className="btn-ghost text-xs">
              Recalcular
            </button>
          </form>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(personalities ?? []).map((p) => {
            const def = p.personality_definitions as unknown as {
              name: string;
              emoji: string;
            } | null;
            return (
              <div
                key={p.personality_code}
                className={`rounded-2xl border px-3 py-2 text-sm ${
                  p.is_primary ? "border-[var(--amber)]" : "border-[var(--line)]"
                }`}
              >
                {def?.emoji} {def?.name ?? p.personality_code}
              </div>
            );
          })}
        </div>
      </div>

      <ProfileEditor profile={profile} />

      <div className="grid grid-cols-2 gap-3">
        <Link href="/app/stats" className="surface p-4 text-center">
          <p className="font-display text-lg">Estadísticas</p>
        </Link>
        <Link href="/app/achievements" className="surface p-4 text-center">
          <p className="font-display text-lg">Logros</p>
        </Link>
        <Link href="/app/album" className="surface p-4 text-center">
          <p className="font-display text-lg">Álbum</p>
        </Link>
        <Link href="/app/museum" className="surface p-4 text-center">
          <p className="font-display text-lg">Museo</p>
        </Link>
      </div>
    </section>
  );
}
