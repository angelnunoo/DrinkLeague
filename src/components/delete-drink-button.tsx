"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidDrinkLogAction } from "@/app/actions";

export function DeleteDrinkButton({
  logId,
  venue,
}: {
  logId: string;
  venue?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="min-h-12 w-full rounded-xl border border-[var(--danger)] px-3 py-2.5 text-sm font-semibold text-[var(--danger)]"
      >
        Eliminar
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-3">
      <p className="text-sm text-[var(--danger)]">
        ¿Eliminar consumición{venue ? ` en ${venue}` : ""}? Se restarán los puntos.
      </p>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn-ghost min-h-12 text-sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="min-h-12 rounded-full bg-[var(--danger)] px-3 font-semibold text-white"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                const result = await voidDrinkLogAction(logId);
                if (result?.error) {
                  setError(result.error);
                  return;
                }
                window.location.assign("/app/drinks?voided=1");
              } catch {
                setError("No se pudo eliminar. Inténtalo de nuevo.");
              }
            });
          }}
        >
          {pending ? "Eliminando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
