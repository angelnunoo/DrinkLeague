"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createLeagueAction } from "@/app/actions";
import { SubmitButton } from "@/components/auth-form";

export default function NewLeaguePage() {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <section className="animate-rise">
      <Link href="/app/leagues" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
        ← Ligas
      </Link>
      <h1 className="mt-2 font-display text-3xl">Nueva liga</h1>
      <p className="mt-1 text-[var(--muted)]">Privada. Solo entran con tu código o enlace.</p>

      <div className="surface mt-6 p-6">
        <form
          className="flex flex-col gap-4"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              try {
                const result = await createLeagueAction(fd);
                if (result?.error) setError(result.error);
              } catch {
                // redirect on success
              }
            });
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Nombre</span>
            <input
              className="input"
              name="name"
              required
              minLength={2}
              maxLength={60}
              placeholder="Los del jueves"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Descripción (opcional)</span>
            <textarea className="input min-h-24" name="description" maxLength={280} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Timezone</span>
            <select className="input" name="timezone" defaultValue="Europe/Madrid">
              <option value="Europe/Madrid">Europe/Madrid</option>
              <option value="Europe/Lisbon">Europe/Lisbon</option>
              <option value="Atlantic/Canary">Atlantic/Canary</option>
              <option value="America/Mexico_City">America/Mexico_City</option>
              <option value="America/Bogota">America/Bogota</option>
              <option value="America/Buenos_Aires">America/Buenos_Aires</option>
            </select>
          </label>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <SubmitButton className="w-full">Crear liga</SubmitButton>
        </form>
      </div>
    </section>
  );
}
