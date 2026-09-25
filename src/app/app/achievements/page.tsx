import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function AchievementsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [{ data: defs }, { data: unlocked }] = await Promise.all([
    supabase
      .from("achievement_definitions")
      .select("code, name, description, is_secret, emoji, rarity")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("user_achievements")
      .select("achievement_code, unlocked_at")
      .eq("user_id", profile.id),
  ]);

  const unlockedSet = new Set((unlocked ?? []).map((u) => u.achievement_code));
  const secrets = (defs ?? []).filter((d) => d.is_secret);
  const normal = (defs ?? []).filter((d) => !d.is_secret);

  return (
    <section className="animate-rise space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Colección</p>
        <h1 className="font-display text-3xl">Logros</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {unlockedSet.size} desbloqueados · {secrets.length} secretos ocultos
        </p>
      </div>

      <div>
        <h2 className="font-display text-xl">Visibles</h2>
        <div className="mt-3 grid gap-2">
          {normal.map((d) => {
            const got = unlockedSet.has(d.code);
            return (
              <div
                key={d.code}
                className={`stat-chip ${got ? "border-[var(--teal)]/40" : "opacity-60"}`}
              >
                <p className="font-semibold">
                  {d.emoji ?? "🏅"} {d.name}
                </p>
                <p className="text-xs text-[var(--muted)]">{d.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl">Secretos</h2>
        <p className="text-xs text-[var(--muted)]">No se revelan hasta desbloquearlos.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {secrets.map((d) => {
            const got = unlockedSet.has(d.code);
            return (
              <div
                key={d.code}
                className={`flex min-h-[7rem] flex-col items-center justify-center rounded-2xl border p-3 text-center ${
                  got
                    ? "border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_12%,transparent)]"
                    : "border-[var(--line)] bg-[rgba(7,16,14,0.55)]"
                }`}
              >
                {got ? (
                  <>
                    <span className="text-3xl">{d.emoji ?? "🔥"}</span>
                    <p className="mt-1 font-display text-sm">{d.name}</p>
                    <p className="mt-1 line-clamp-3 text-[10px] text-[var(--muted)]">
                      {d.description}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="font-display text-3xl text-[var(--muted)]">???</span>
                    <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      Secreto
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Link href="/app/profile" className="text-sm text-[var(--muted)]">
        ← Perfil
      </Link>
    </section>
  );
}
