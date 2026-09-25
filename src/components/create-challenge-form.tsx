"use client";

import { useState, useTransition } from "react";
import { createChallengeAction } from "@/app/actions";
import { SubmitButton } from "@/components/auth-form";

const MODES = [
  { value: "1v1", label: "1 vs 1" },
  { value: "2v2", label: "2 vs 2" },
  { value: "3v3", label: "3 vs 3" },
  { value: "ffa3", label: "1 vs 1 vs 1" },
  { value: "ffa4", label: "1 vs 1 vs 1 vs 1" },
  { value: "multi", label: "Multijugador" },
];

export function CreateChallengeForm({
  leagues,
}: {
  leagues: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await createChallengeAction(fd);
          if (r?.error) setError(r.error);
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm text-[var(--muted)]">Modo</span>
        <select name="mode" className="input" defaultValue="1v1">
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-[var(--muted)]">Códigos de amigos rivales</span>
        <input
          className="input uppercase tracking-wider"
          name="opponent_codes"
          placeholder="AB12CD34 o varios separados"
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[var(--muted)]">Duración (h)</span>
          <input
            className="input"
            type="number"
            name="duration_hours"
            defaultValue={24}
            min={1}
            max={168}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[var(--muted)]">Apuesta (pts)</span>
          <input
            className="input"
            type="number"
            name="stake_points"
            defaultValue={0}
            min={0}
            max={5000}
          />
        </label>
      </div>

      {leagues.length ? (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[var(--muted)]">Liga (opcional)</span>
          <select name="league_id" className="input" defaultValue="">
            <option value="">Sin liga</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <SubmitButton>Lanzar desafío</SubmitButton>
    </form>
  );
}
