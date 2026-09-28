import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { DRINK_LABELS, type DrinkCode } from "@/lib/types";
import { DeleteDrinkButton } from "@/components/delete-drink-button";

export const dynamic = "force-dynamic";

type DrinkItem = {
  quantity: number;
  unit_points: number;
  code?: string;
  name?: string;
};

type MyDrinkLog = {
  id: string;
  venue_name: string;
  consumed_at: string;
  points_total: number;
  status: string;
  items: DrinkItem[] | null;
};

function formatWhen(iso: string) {
  const when = new Date(iso);
  const day = when.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = when.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { day, time };
}

export default async function MyDrinksPage({
  searchParams,
}: {
  searchParams: Promise<{ voided?: string; error?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: rpcLogs, error: rpcError } = await supabase.rpc("list_my_drink_logs", {
    p_limit: 100,
  });

  let logs: MyDrinkLog[] = [];
  if (!rpcError && Array.isArray(rpcLogs)) {
    logs = rpcLogs as MyDrinkLog[];
  } else {
    // Fallback if RPC unavailable
    const { data } = await supabase
      .from("drink_logs")
      .select(
        "id, venue_name_snapshot, consumed_at, points_total, status, drink_log_items(quantity, unit_points, drink_types(code, name))",
      )
      .eq("user_id", profile.id)
      .eq("status", "active")
      .order("consumed_at", { ascending: false })
      .limit(100);

    logs = (data ?? []).map((row) => {
      const rawItems = (row.drink_log_items ?? []) as unknown as Array<{
        quantity: number;
        unit_points: number;
        drink_types: { code: string; name: string } | null;
      }>;
      return {
        id: row.id as string,
        venue_name: String(row.venue_name_snapshot || "Sin lugar"),
        consumed_at: String(row.consumed_at),
        points_total: Number(row.points_total ?? 0),
        status: String(row.status ?? "active"),
        items: rawItems.map((it) => ({
          quantity: it.quantity,
          unit_points: it.unit_points,
          code: it.drink_types?.code,
          name: it.drink_types?.name,
        })),
      };
    });
  }

  return (
    <section className="animate-rise space-y-6">
      <div>
        <h1 className="font-display text-3xl">🍺 Mis consumiciones</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Lugar, día y hora de cada registro. Puedes eliminar si te equivocaste.
        </p>
      </div>

      {sp.voided ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-4 py-3 text-sm text-[var(--teal)]">
          Consumición eliminada. Puntos y clasificaciones actualizados.
        </p>
      ) : null}

      {sp.error ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}

      <ul className="space-y-4">
        {logs.map((log) => {
          const { day, time } = formatWhen(log.consumed_at);
          const items = Array.isArray(log.items) ? log.items : [];
          return (
            <li key={log.id} className="surface space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-lg font-semibold text-[var(--ink-strong)]">
                    📍 {log.venue_name || "Sin lugar"}
                  </p>
                  <p className="text-sm capitalize text-[var(--muted)]">{day}</p>
                  <p className="text-sm font-semibold text-[var(--ink)]">🕒 {time}</p>
                </div>
                <p className="shrink-0 font-display text-2xl text-[var(--amber)]">
                  +{log.points_total}
                </p>
              </div>

              <ul className="space-y-2 rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] px-3 py-3">
                {items.length ? (
                  items.map((it, idx) => {
                    const code = (it.code ?? "") as DrinkCode;
                    const label = DRINK_LABELS[code] ?? it.name ?? "Bebida";
                    return (
                      <li
                        key={`${log.id}-${idx}`}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="font-medium">
                          {label} <span className="text-[var(--muted)]">×{it.quantity}</span>
                        </span>
                        <span className="text-[var(--muted)]">
                          +{it.quantity * it.unit_points}
                        </span>
                      </li>
                    );
                  })
                ) : (
                  <li className="text-sm text-[var(--muted)]">Sin detalle de bebidas</li>
                )}
              </ul>

              <DeleteDrinkButton logId={log.id} venue={log.venue_name} />
            </li>
          );
        })}

        {!logs.length ? (
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
