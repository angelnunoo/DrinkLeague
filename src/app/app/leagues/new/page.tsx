"use client";

import Link from "next/link";
import { useState } from "react";
import { createLeagueAction } from "@/app/actions";

export default function NewLeaguePage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(fd: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createLeagueAction(fd);
      if (result?.error) {
        setError(result.error);
        setPending(false);
        return;
      }
      const leagueId = (result?.payload as { leagueId?: string } | undefined)?.leagueId;
      if (!leagueId) {
        setError("No se pudo crear la liga.");
        setPending(false);
        return;
      }
      window.location.assign(`/app/leagues/${leagueId}?created=1`);
    } catch {
      setError("No se pudo crear la liga. Inténtalo de nuevo.");
      setPending(false);
    }
  }

  return (
    <section className="animate-rise">
      <Link href="/app/leagues" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
        ← Ligas
      </Link>
      <h1 className="mt-2 font-display text-3xl">Nueva liga</h1>
      <p className="mt-1 text-[var(--muted)]">
        Puedes tener varias. Privada: solo entran con tu código o enlace.
      </p>

      <div className="surface mt-6 p-6">
        <form className="flex flex-col gap-4" action={onSubmit}>
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
            <span className="text-sm text-[var(--muted)]">Zona horaria</span>
            <select className="input" name="timezone" defaultValue="Europe/Madrid">
              <option value="Europe/Madrid">España (Madrid)</option>
              <option value="Atlantic/Canary">Canarias</option>
              <option value="Europe/Lisbon">Lisboa</option>
              <option value="America/Mexico_City">Ciudad de México</option>
              <option value="America/Bogota">Bogotá</option>
              <option value="America/Buenos_Aires">Buenos Aires</option>
            </select>
          </label>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <button type="submit" disabled={pending} className="btn-primary w-full min-h-12">
            {pending ? "Creando…" : "Crear liga"}
          </button>
        </form>
      </div>
    </section>
  );
}
