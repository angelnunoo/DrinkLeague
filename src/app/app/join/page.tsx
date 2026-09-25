"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { joinByCodeAction } from "@/app/actions";

export default function JoinPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="animate-rise space-y-6">
      <div>
        <h1 className="font-display text-3xl">Unirme a una liga</h1>
        <p className="mt-1 text-[var(--muted)]">
          Pega el código o abre el enlace que te mandaron por WhatsApp.
        </p>
      </div>

      <div className="surface p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setError(null);
            startTransition(async () => {
              try {
                const result = await joinByCodeAction(fd);
                if (result?.error) setError(result.error);
              } catch {
                /* redirect */
              }
            });
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Código de liga</span>
            <input
              className="input uppercase tracking-[0.2em]"
              name="code"
              required
              placeholder="A1B2C3D4"
              maxLength={12}
              autoCapitalize="characters"
            />
          </label>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Entrando…" : "Unirme"}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-[var(--muted)]">
        ¿Te pasaron un enlace? Ábrelo directamente.{" "}
        <Link href="/app/leagues" className="font-semibold text-[var(--ink-strong)] underline-offset-2 hover:underline">
          Ver mis ligas
        </Link>
      </p>
    </section>
  );
}
