import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { claimBattlePassAction } from "@/app/actions";
import { xpProgress } from "@/lib/domain";
import { XpBar } from "@/components/ui/xp-bar";

export default async function BattlePassPage({
  searchParams,
}: {
  searchParams: Promise<{ claimed?: string; error?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;
  const progress = xpProgress(Number(profile.xp));
  const xp = Number(profile.xp);

  const supabase = await createClient();
  const { data: season } = await supabase
    .from("battle_pass_seasons")
    .select("*")
    .eq("is_active", true)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: levels } = season
    ? await supabase
        .from("battle_pass_levels")
        .select("*")
        .eq("season_id", season.id)
        .order("level")
    : { data: [] };

  const { data: progressRow } = season
    ? await supabase
        .from("user_battle_pass")
        .select("*")
        .eq("user_id", profile.id)
        .eq("season_id", season.id)
        .maybeSingle()
    : { data: null };

  const claimed = new Set((progressRow?.claimed_levels as number[] | null) ?? []);
  const all = levels ?? [];

  let currentLevel = 0;
  for (const lv of all) {
    if (xp >= lv.xp_required) currentLevel = lv.level;
  }

  const upcoming = all.filter((lv) => !claimed.has(lv.level) && xp < lv.xp_required).slice(0, 5);
  const claimable = all.filter((lv) => !claimed.has(lv.level) && xp >= lv.xp_required);
  const unlocked = all.filter((lv) => claimed.has(lv.level)).slice(-6);
  const focusLevel = claimable[0]?.level ?? (currentLevel || 1);

  return (
    <section className="animate-rise space-y-5">
      <div className="home-hero">
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Pase de temporada
        </p>
        <h1 className="font-display text-3xl text-[var(--ink-strong)]">
          {season?.title ?? "Temporada"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Nivel {currentLevel} · {all.length} recompensas · estilo Clash / Fortnite
        </p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase text-[var(--muted)]">Tu nivel</p>
            <p className="font-display text-5xl text-[var(--amber)]">{progress.level}</p>
          </div>
          <div className="flex-1 pb-1">
            <XpBar ratio={progress.ratio} size="lg" accent="gold" label={`${xp} XP`} />
          </div>
        </div>
      </div>

      {sp.claimed ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          🎁 Nivel {sp.claimed} reclamado.
        </p>
      ) : null}
      {sp.error ? <p className="text-sm text-[var(--danger)]">{sp.error}</p> : null}

      {/* Horizontal track (mobile swipe) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl">Pista de recompensas</h2>
          <span className="text-xs text-[var(--muted)]">Desliza →</span>
        </div>
        <div className="bp-track">
          {all.map((lv) => {
            const done = claimed.has(lv.level);
            const unlockedNow = xp >= lv.xp_required;
            const isFocus = lv.level === focusLevel;
            return (
              <div
                key={lv.level}
                className={`bp-node ${
                  done
                    ? "bp-node-claimed"
                    : isFocus
                      ? "bp-node-current"
                      : unlockedNow
                        ? ""
                        : "bp-node-locked"
                }`}
              >
                <p className="text-[10px] text-[var(--muted)]">Nv.{lv.level}</p>
                <p className="mt-1 text-2xl" aria-hidden>
                  {done ? "✅" : unlockedNow ? "🎁" : "🔒"}
                </p>
                <p className="mt-1 line-clamp-2 text-[10px] leading-tight">{lv.reward_label}</p>
                {!done && unlockedNow ? (
                  <form action={claimBattlePassAction.bind(null, lv.level)} className="mt-2">
                    <button type="submit" className="btn-primary w-full px-1 py-1 text-[10px]">
                      Pillar
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
          {!all.length ? (
            <p className="px-2 text-sm text-[var(--muted)]">Sin niveles cargados.</p>
          ) : null}
        </div>
      </div>

      {/* Claimable spotlight */}
      {claimable.length ? (
        <div className="premium-banner p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
            Listas para reclamar
          </p>
          <ul className="mt-3 space-y-2">
            {claimable.slice(0, 4).map((lv) => (
              <li
                key={lv.level}
                className="flex items-center justify-between gap-2 rounded-xl bg-[rgba(7,16,14,0.45)] px-3 py-2"
              >
                <div>
                  <p className="font-display text-lg">Nivel {lv.level}</p>
                  <p className="text-xs text-[var(--muted)]">{lv.reward_label}</p>
                </div>
                <form action={claimBattlePassAction.bind(null, lv.level)}>
                  <button type="submit" className="btn-primary px-3 py-1.5 text-xs">
                    Reclamar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Vertical sections */}
      <div className="grid gap-3">
        <Section title="Desbloqueadas" empty="Aún no has reclamado nada.">
          {unlocked.map((lv) => (
            <RewardRow key={lv.level} level={lv.level} label={lv.reward_label} state="done" />
          ))}
        </Section>
        <Section title="Próximas" empty="¡Has llegado al final del pase!">
          {upcoming.map((lv) => (
            <RewardRow
              key={lv.level}
              level={lv.level}
              label={lv.reward_label}
              state="locked"
              meta={`${lv.xp_required} XP`}
            />
          ))}
        </Section>
        <Section title="Futuras (pista)" empty="">
          {all
            .filter((lv) => lv.level > currentLevel + 5)
            .slice(0, 8)
            .map((lv) => (
              <RewardRow
                key={lv.level}
                level={lv.level}
                label={lv.reward_label}
                state="future"
                meta={`${lv.xp_required} XP`}
              />
            ))}
        </Section>
      </div>

      <Link href="/app" className="mega-cta !text-base">
        🍺 Sumar XP registrando
      </Link>
    </section>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const has = arr.some(Boolean) && arr.flat().filter(Boolean).length > 0;
  return (
    <div className="surface p-4">
      <h3 className="font-display text-lg">{title}</h3>
      <ul className="mt-2 space-y-2">
        {has ? children : <li className="text-sm text-[var(--muted)]">{empty || "—"}</li>}
      </ul>
    </div>
  );
}

function RewardRow({
  level,
  label,
  state,
  meta,
}: {
  level: number;
  label: string;
  state: "done" | "locked" | "future";
  meta?: string;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
        state === "done"
          ? "border-[var(--teal)]/40 bg-[color-mix(in_srgb,var(--teal)_8%,transparent)]"
          : state === "future"
            ? "border-[var(--line)] opacity-60"
            : "border-[var(--line)]"
      }`}
    >
      <div>
        <p className="font-semibold">Nv. {level}</p>
        <p className="text-xs text-[var(--muted)]">{label}</p>
      </div>
      <span className="text-xs text-[var(--muted)]">
        {state === "done" ? "OK" : meta ?? "🔒"}
      </span>
    </li>
  );
}
