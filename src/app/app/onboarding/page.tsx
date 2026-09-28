import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { OnboardingCard, type OnboardingMission } from "@/components/onboarding-card";

export default async function OnboardingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.rpc("sync_onboarding_progress");
  const payload = (data ?? {}) as {
    done?: number;
    total?: number;
    missions?: OnboardingMission[];
  };

  return (
    <section className="animate-rise space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Primeros pasos
        </p>
        <h1 className="font-display text-3xl">Onboarding</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Entiende DrinkLeague en menos de un minuto.
        </p>
      </div>
      <OnboardingCard
        missions={payload.missions ?? []}
        done={Number(payload.done ?? 0)}
        total={Number(payload.total ?? 4)}
      />
    </section>
  );
}
