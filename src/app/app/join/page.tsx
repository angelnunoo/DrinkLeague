"use client";

import { useState, useTransition } from "react";
import { joinByCodeAction } from "@/app/actions";
import { SubmitButton } from "@/components/auth-form";

export default function JoinPage() {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <section className="animate-rise">
      <h1 className="font-display text-3xl">Unirme a una liga</h1>
      <p className="mt-1 text-[var(--muted)]">Pega el código que te compartió tu grupo.</p>

      <div className="surface mt-6 p-6">
        <form
          className="flex flex-col gap-4"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const result = await joinByCodeAction(fd);
              if (result?.error) setError(result.error);
            });
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Código</span>
            <input
              className="input uppercase tracking-[0.2em]"
              name="code"
              required
              placeholder="A1B2C3D4"
              maxLength={12}
            />
          </label>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <SubmitButton className="w-full">Unirme</SubmitButton>
        </form>
      </div>
    </section>
  );
}
