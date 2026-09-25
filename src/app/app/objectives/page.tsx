import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { XpBar } from "@/components/ui/xp-bar";

export default async function ObjectivesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  await supabase.rpc("ensure_personal_objectives", { p_user_id: profile.id });

  const { data: objectives } = await supabase
    .from("personal_objectives")
    .select("*")
    .eq("user_id", profile.id)
    .order("status")
    .order("created_at", { ascending: false });

  const active = (objectives ?? []).filter((o) => o.status === "active");
  const done = (objectives ?? []).filter((o) => o.status === "completed");

  return (
    <section className="animate-rise space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Misiones</p>
        <h1 className="font-display text-3xl">Objetivos personales</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Generados automáticamente · progreso en tiempo real
        </p>
      </div>

      <div className="space-y-3">
        {active.map((o) => {
          const ratio = Math.min(1, Number(o.current_value) / Math.max(Number(o.target), 1));
          return (
            <div key={o.id} className="surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl">{o.title}</h2>
                  <p className="text-sm text-[var(--muted)]">{o.description}</p>
                </div>
                <span className="font-display text-lg text-[var(--amber)]">
                  {Math.round(Number(o.current_value))}/{Math.round(Number(o.target))}
                </span>
              </div>
              <div className="mt-3">
                <XpBar ratio={ratio} accent="teal" size="md" />
              </div>
            </div>
          );
        })}
        {!active.length ? (
          <p className="text-sm text-[var(--muted)]">No hay objetivos activos.</p>
        ) : null}
      </div>

      {done.length ? (
        <div className="surface p-4">
          <h2 className="font-display text-xl">Completados</h2>
          <ul className="mt-2 space-y-1 text-sm text-[var(--teal)]">
            {done.map((o) => (
              <li key={o.id}>✓ {o.title}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link href="/app" className="text-sm text-[var(--muted)]">
        ← Inicio
      </Link>
    </section>
  );
}
