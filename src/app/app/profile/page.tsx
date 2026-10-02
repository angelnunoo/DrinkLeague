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
import { ProfileTabs } from "@/components/profile-tabs";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarDisplay(url: string | null | undefined) {
  if (url?.startsWith("emoji:")) return url.slice(6);
  return null;
}

const BANNER_PRESETS: Record<string, string> = {
  "banner:casino": "linear-gradient(135deg,#1a1208,#3a2208 40%,#0b1512)",
  "banner:teal": "linear-gradient(135deg,#0b1512,#134e4a 50%,#0f172a)",
  "banner:night": "linear-gradient(135deg,#0f172a,#1e1b4b 55%,#0b1512)",
  "banner:ember": "linear-gradient(135deg,#1c0a0a,#7c2d12 45%,#0b1512)",
  "banner:gold": "linear-gradient(135deg,#2a1a00,#854d0e 40%,#0b1512)",
  "banner:forest": "linear-gradient(135deg,#052e16,#14532d 50%,#0b1512)",
  banner_night: "linear-gradient(135deg,#0f172a,#1e1b4b 55%,#0b1512)",
  banner_premium_bar: "linear-gradient(135deg,#1a1208,#3a2208 40%,#0b1512)",
  banner_weekend_party: "linear-gradient(135deg,#1c0a0a,#7c2d12 45%,#0b1512)",
  banner_rare_storm: "linear-gradient(135deg,#0b1512,#134e4a 50%,#0f172a)",
  banner_founder: "linear-gradient(135deg,#2a1a00,#854d0e 40%,#0b1512)",
};

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

  const emojiAvatar = avatarDisplay(profile.avatar_url);
  const bannerKey = profile.banner_url ?? "";
  const bannerCss = BANNER_PRESETS[bannerKey]
    ?? (bannerKey.startsWith("http")
      ? `center/cover url(${bannerKey})`
      : "linear-gradient(145deg, rgba(45,212,191,0.2), rgba(240,162,2,0.14)), radial-gradient(500px 220px at 100% 0%, rgba(255,213,106,0.28), transparent)");
  const frame = profile.equipped_cosmetics?.frame ?? "gold";
  const frameClass =
    frame === "teal" || String(frame).includes("teal")
      ? "frame-teal"
      : frame === "rose" || String(frame).includes("rose") || String(frame).includes("fire")
        ? "frame-rose"
        : frame === "none"
          ? ""
          : "frame-gold";
  const rival = (chemistry ?? [])[0];
  const rivalId = rival ? (rival.user_a === profile.id ? rival.user_b : rival.user_a) : null;
  const rivalName = rivalId ? fname.get(rivalId) : null;

  const gold = (medals ?? []).filter((m) => m.place === 1).length;
  const silver = (medals ?? []).filter((m) => m.place === 2).length;
  const bronze = (medals ?? []).filter((m) => m.place === 3).length;

  const titleOptions = (titles ?? []).map((t) => {
    const def = t.title_definitions as unknown as { name: string; emoji: string } | null;
    return {
      code: t.title_code,
      name: def?.name ?? t.title_code,
      emoji: def?.emoji ?? "🏅",
    };
  });

  return (
    <section className="animate-rise space-y-5 pb-4">
      {/* Hero identity card */}
      <div className="profile-banner">
        <div className="profile-banner-inner" style={{ background: bannerCss }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,16,14,0.95)] via-[rgba(7,16,14,0.35)] to-transparent" />
        <div className="relative flex items-end gap-4 p-5 pt-16">
          <div
            className={`avatar-ring avatar-ring-gold flex h-20 w-20 shrink-0 items-center justify-center font-display text-3xl ${frameClass}`}
          >
            {emojiAvatar ? (
              emojiAvatar
            ) : profile.avatar_url ? (
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
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--amber)]">
              {profile.title ?? "Novato"}
              {personaDef ? ` · ${personaDef.emoji} ${personaDef.name}` : ""}
            </p>
            <h1 className="truncate font-display text-3xl text-[var(--ink-strong)]">
              {profile.display_name}
            </h1>
            <p className="text-xs text-[var(--muted)]">
              Nv.{progress.level}
              {profile.prestige_level
                ? ` · Prestigio ${["", "I", "II", "III", "IV", "V"][Math.min(profile.prestige_level, 5)]}`
                : ""}
              {rivalName ? ` · Rival · ${rivalName}` : ""}
            </p>
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-2 px-5 pb-4">
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

        <div className="relative px-5 pb-5">
          <XpBar ratio={progress.ratio} size="md" accent="teal" label={`${profile.xp} XP`} />
        </div>
      </div>

      <StreakStrip streaks={streakRows ?? []} />

      {/* Season strip + medals */}
      <div className="surface p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="profile-section-label">Temporada</p>
          <Link href="/app/battle-pass" className="text-xs font-semibold text-[var(--teal)]">
            Pase →
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <div className="stat-chip p-2.5 text-center">
            <p className="text-[9px] text-[var(--muted)]">Logs</p>
            <p className="font-display text-xl">{stats?.total_logs ?? 0}</p>
          </div>
          <div className="stat-chip p-2.5 text-center">
            <p className="text-[9px] text-[var(--muted)]">Logros</p>
            <p className="font-display text-xl">{achievements?.length ?? 0}</p>
          </div>
          <div className="stat-chip p-2.5 text-center">
            <p className="text-[9px] text-[var(--muted)]">Trofeos</p>
            <p className="font-display text-xl">{trophies?.length ?? 0}</p>
          </div>
          <div className="stat-chip p-2.5 text-center">
            <p className="text-[9px] text-[var(--muted)]">Títulos</p>
            <p className="font-display text-xl">{titles?.length ?? 0}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-around rounded-2xl border border-[var(--line)] bg-[rgba(7,16,14,0.45)] px-3 py-3 font-display text-2xl">
          <span title="Oro">🥇 {gold}</span>
          <span title="Plata">🥈 {silver}</span>
          <span title="Bronce">🥉 {bronze}</span>
          <span title="Trofeos">🏆 {(trophies ?? []).length}</span>
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
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-4 py-3 text-sm text-[var(--teal)] animate-pop">
          Perfil actualizado.
        </p>
      ) : null}

      {/* Collection tabs */}
      <div>
        <p className="profile-section-label mb-2">Colección</p>
        <ProfileTabs
          panels={{
            stats: (
              <div className="surface space-y-4 p-5">
                <h2 className="font-display text-xl">Estadísticas</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="stat-chip p-3">
                    <p className="text-xs text-[var(--muted)]">Puntos totales</p>
                    <p className="font-display text-2xl text-[var(--amber)]">
                      {stats?.total_points ?? 0}
                    </p>
                  </div>
                  <div className="stat-chip p-3">
                    <p className="text-xs text-[var(--muted)]">Consumiciones</p>
                    <p className="font-display text-2xl">{stats?.total_logs ?? 0}</p>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Link href="/app/stats" className="btn-ghost min-h-12 w-full text-sm">
                    Ver gráficos →
                  </Link>
                  <Link href="/app/drinks" className="btn-ghost min-h-12 w-full text-sm">
                    Mis consumiciones
                  </Link>
                </div>
              </div>
            ),
            trophies: (
              <div className="surface space-y-4 p-5">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h2 className="font-display text-xl">Vitrina</h2>
                    <p className="text-xs text-[var(--muted)]">8 slots · muestra tus trofeos</p>
                  </div>
                  <span className="text-xs text-[var(--muted)]">
                    {(trophies ?? []).length} ganados
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
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
                        className={`profile-trophy-slot ${def ? "is-filled" : ""}`}
                      >
                        <span className="text-2xl">{def?.icon ?? "◇"}</span>
                        <span className="line-clamp-2 text-[9px] text-[var(--muted)]">
                          {def?.name ?? `Slot ${slot}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {(trophies ?? []).length > 0 ? (
                  <div>
                    <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      Equipar en slot 1
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(trophies ?? []).slice(0, 10).map((t) => {
                        const def = t.trophy_definitions as unknown as {
                          name: string;
                          icon: string;
                        } | null;
                        return (
                          <form key={t.id} action={setTrophyShowcaseAction.bind(null, 1, t.id)}>
                            <button type="submit" className="btn-ghost min-h-11 px-3 text-xs">
                              {def?.icon} {def?.name ?? t.trophy_code}
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                    Gana guerras y MVPs para llenar la vitrina.
                  </p>
                )}
              </div>
            ),
            achievements: (
              <div className="surface space-y-3 p-5">
                <div className="flex items-end justify-between gap-2">
                  <h2 className="font-display text-xl">Logros</h2>
                  <Link href="/app/achievements" className="text-xs font-semibold text-[var(--teal)]">
                    Ver todos →
                  </Link>
                </div>
                {(achievements ?? []).slice(0, 8).map((a) => {
                  const def = a.achievement_definitions as unknown as {
                    name: string;
                    description: string;
                  } | null;
                  return (
                    <div key={`${a.achievement_code}-${a.unlocked_at}`} className="stat-chip p-3">
                      <p className="font-semibold">{def?.name ?? a.achievement_code}</p>
                      <p className="text-xs text-[var(--muted)]">{def?.description}</p>
                    </div>
                  );
                })}
                {!achievements?.length ? (
                  <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                    Sigue registrando para desbloquear logros.
                  </p>
                ) : null}
              </div>
            ),
            chemistry: (
              <div className="surface space-y-3 p-5">
                <h2 className="font-display text-xl">Química</h2>
                <ul className="space-y-2">
                  {(chemistry ?? []).map((c) => {
                    const other = c.user_a === profile.id ? c.user_b : c.user_a;
                    return (
                      <li
                        key={`${c.user_a}-${c.user_b}`}
                        className="rank-row flex items-center gap-3 px-3 py-3"
                      >
                        <div className="avatar-ring flex h-10 w-10 items-center justify-center text-xs font-bold">
                          {initials(fname.get(other) ?? "?")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{fname.get(other) ?? "Amigo"}</p>
                          <p className="text-[10px] text-[var(--muted)]">
                            Nivel {c.chemistry_level}
                          </p>
                        </div>
                        <span className="font-display text-xl text-[var(--teal)]">
                          {Math.round(Number(c.chemistry_score))}%
                        </span>
                      </li>
                    );
                  })}
                  {!chemistry?.length ? (
                    <li className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                      Añade amigos en Social para construir química.
                    </li>
                  ) : null}
                </ul>
                <div className="grid gap-2 pt-1">
                  <Link href="/app/social" className="btn-ghost min-h-12 w-full text-sm">
                    Ir a Social
                  </Link>
                  <Link href="/app/legacy" className="btn-primary min-h-12 w-full text-sm">
                    Ver Legado
                  </Link>
                </div>
              </div>
            ),
            bets: (
              <div className="surface space-y-3 p-5 text-center">
                <h2 className="font-display text-xl">Apuestas</h2>
                <p className="text-sm text-[var(--muted)]">
                  Mercados, SuperAumentos y fichas en DrinkBets.
                </p>
                <Link href="/app/bets" className="btn-primary min-h-12 w-full">
                  Abrir DrinkBets
                </Link>
                <Link href="/app/shop" className="btn-ghost min-h-12 w-full">
                  Tienda
                </Link>
              </div>
            ),
            games: (
              <div className="surface space-y-3 p-5 text-center">
                <h2 className="font-display text-xl">Juegos & Casino</h2>
                <p className="text-sm text-[var(--muted)]">
                  Sociales sin fichas · DrinkCasino con apuestas.
                </p>
                <Link href="/app/games" className="btn-primary min-h-12 w-full">
                  Juegos
                </Link>
                <Link href="/app/casino" className="mega-cta !min-h-12 w-full !text-base">
                  DrinkCasino
                </Link>
              </div>
            ),
          }}
        />
      </div>

      {/* Titles */}
      <div className="surface space-y-3 p-5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="profile-section-label">Cosméticos</p>
            <h2 className="font-display text-xl">Títulos</h2>
          </div>
          <span className="text-xs text-[var(--muted)]">{(titles ?? []).length}</span>
        </div>
        {(titles ?? []).length ? (
          <ul className="space-y-2">
            {(titles ?? []).map((t) => {
              const def = t.title_definitions as unknown as {
                name: string;
                emoji: string;
                rarity: string;
              } | null;
              const equipped = profile.equipped_title_code === t.title_code;
              return (
                <li key={t.title_code}>
                  {equipped ? (
                    <div className="profile-title-chip is-equipped">
                      <div>
                        <p className="font-semibold">
                          {def?.emoji} {def?.name ?? t.title_code}
                        </p>
                        <p className="text-[10px] capitalize text-[var(--muted)]">
                          {def?.rarity}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-[var(--teal)]">Equipado</span>
                    </div>
                  ) : (
                    <form action={equipTitleAction.bind(null, t.title_code)}>
                      <button type="submit" className="profile-title-chip">
                        <div>
                          <p className="font-semibold">
                            {def?.emoji} {def?.name ?? t.title_code}
                          </p>
                          <p className="text-[10px] capitalize text-[var(--muted)]">
                            {def?.rarity}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-[var(--amber)]">Equipar</span>
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">
            Desbloquea títulos jugando y completando logros.
          </p>
        )}
      </div>

      {/* Personality */}
      <div className="surface space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="profile-section-label">Estilo de juego</p>
            <h2 className="font-display text-xl">Personalidad</h2>
          </div>
          <form action={refreshPersonalitiesAction}>
            <button type="submit" className="btn-ghost min-h-10 text-xs">
              Recalcular
            </button>
          </form>
        </div>
        {(personalities ?? []).length ? (
          <div className="flex flex-wrap gap-2">
            {(personalities ?? []).map((p) => {
              const def = p.personality_definitions as unknown as {
                name: string;
                emoji: string;
              } | null;
              return (
                <div
                  key={p.personality_code}
                  className={`rounded-2xl border px-3 py-2 text-sm ${
                    p.is_primary
                      ? "border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)]"
                      : "border-[var(--line)]"
                  }`}
                >
                  {def?.emoji} {def?.name ?? p.personality_code}
                  {p.is_primary ? (
                    <span className="ml-1 text-[10px] text-[var(--amber)]">· principal</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Juega más para descubrir tu personalidad DrinkLeague.
          </p>
        )}
      </div>

      {/* Cosmetic studio */}
      <div>
        <p className="profile-section-label mb-2">Estudio</p>
        <ProfileEditor profile={profile} titles={titleOptions} />
      </div>

      {/* Hub shortcuts — single row, no duplicates */}
      <div className="profile-hub-grid">
        <Link href="/app/shop" className="profile-hub-link">
          <p className="font-display text-lg">Tienda</p>
          <p className="text-[10px] text-[var(--muted)]">Cosméticos</p>
        </Link>
        <Link href="/app/casino" className="profile-hub-link">
          <p className="font-display text-lg">DrinkCasino</p>
          <p className="text-[10px] text-[var(--muted)]">Fichas</p>
        </Link>
        <Link href="/app/stats" className="profile-hub-link">
          <p className="font-display text-lg">Estadísticas</p>
          <p className="text-[10px] text-[var(--muted)]">Gráficos</p>
        </Link>
        <Link href="/app/legacy" className="profile-hub-link">
          <p className="font-display text-lg">Legado</p>
          <p className="text-[10px] text-[var(--muted)]">Historia</p>
        </Link>
      </div>
    </section>
  );
}
