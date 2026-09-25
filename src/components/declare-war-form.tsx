"use client";

import { useState, useTransition } from "react";
import { declareWarAction } from "@/app/actions";
import { SubmitButton } from "@/components/auth-form";

export function DeclareWarForm({
  captainLeagues,
}: {
  captainLeagues: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!captainLeagues.length) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Solo el capitán de una liga puede declarar guerra.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await declareWarAction(fd);
          if (r?.error) setError(r.error);
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm text-[var(--muted)]">Tu liga</span>
        <select name="my_league_id" className="input" required defaultValue={captainLeagues[0].id}>
          {captainLeagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-[var(--muted)]">Código de invitación de la liga rival</span>
        <input
          className="input uppercase tracking-widest"
          name="opponent_league_code"
          required
          maxLength={12}
          placeholder="A1B2C3D4"
        />
      </label>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <SubmitButton>Declarar guerra (7 días)</SubmitButton>
    </form>
  );
}
