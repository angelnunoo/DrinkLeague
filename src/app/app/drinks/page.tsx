import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { DRINK_LABELS, type DrinkCode } from "@/lib/types";
import { voidDrinkLogAction } from "@/app/actions";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

export default async function MyDrinksPage({
  searchParams,
}: {
  searchParams: Promise<{ voided?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("drink_logs")
    .select(
      "id, venue_name_snapshot, consumed_at, points_total, status, drink_log_items(quantity, unit_points, drink_types(code, name))",
    )
    .eq("user_id", profile.id)
    .eq("status", "active")
    .order("consumed_at", { ascending: false })
    .limit(80);

  return (
    <section className="animate-rise space-y-6">
      <div>
        <h1 className="font-display text-3xl">🍺 Mis consumiciones</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Historial reciente. Puedes borrar un registro si te equivocaste.
        </p>
      </div>

      {sp.voided ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-4 py-3 text-sm text-[var(--teal)]">
          Consumición eliminada. Puntos y clasificaciones actualizados.
        </p>
      ) : null}

      <ul className="space-y-4">
        {(logs ?? []).map((log) => {
          const items = (log.drink_log_items ?? []) as unknown as Array<{
            quantity: number;
            unit_points: number;
            drink_types: { code: string; name: string } | null;
          }>;
          const when = new Date(log.consumed_at);
          return (
            <li key={log.id} className="surface space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">📍 {log.venue_name_snapshot}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {when.toLocaleDateString("es-ES", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    ·{" "}
                    {when.toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <p className="font-display text-2xl text-[var(--amber)]">+{log.points_total}</p>
              </div>
              <ul className="space-y-1 text-sm">
                {items.map((it, idx) => {
                  const code = (it.drink_types?.code ?? "") as DrinkCode;
                  const label = DRINK_LABELS[code] ?? it.drink_types?.name ?? "Bebida";
                  return (
                    <li key={`${log.id}-${idx}`} className="flex justify-between text-[var(--muted)]">
                      <span>
                        {label} ×{it.quantity}
                      </span>
                      <span>+{it.quantity * it.unit_points}</span>
                    </li>
                  );
                })}
              </ul>
              <ConfirmDeleteButton action={voidDrinkLogAction.bind(null, log.id)} />
            </li>
          );
        })}
        {!logs?.length ? (
          <li className="surface p-8 text-center text-sm text-[var(--muted)]">
            Aún no has registrado nada.{" "}
            <Link
              href="/app#registrar"
              className="font-semibold text-[var(--ink-strong)] underline-offset-2 hover:underline"
            >
              Registrar ahora
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
