"use client";

import { useState, useTransition } from "react";
import { rethrowNextNavigation } from "@/lib/navigation";

type ActionResultLike = { error?: string } | void;

export function ConfirmDeleteButton({
  action,
  label = "Eliminar consumición",
  confirmLabel = "¿Seguro? Se restarán puntos y se actualizarán clasificaciones.",
}: {
  action: () => Promise<ActionResultLike>;
  label?: string;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 w-full rounded-xl border border-[var(--danger)] px-3 py-2 text-sm font-semibold text-[var(--danger)]"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-3">
      <p className="text-sm text-[var(--danger)]">{confirmLabel}</p>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn-ghost min-h-11 text-sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="min-h-11 rounded-full bg-[var(--danger)] px-3 font-semibold text-white"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                const result = await action();
                if (result && typeof result === "object" && result.error) {
                  setError(result.error);
                }
              } catch (e) {
                rethrowNextNavigation(e);
                setError("No se pudo eliminar.");
              }
            });
          }}
        >
          {pending ? "…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
