"use client";

import { useState, useTransition } from "react";
import { placeBetAction } from "@/app/actions";
import { SubmitButton } from "@/components/auth-form";

export function PlaceBetForm({ selectionId }: { selectionId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await placeBetAction(fd);
          if (r?.error) setError(r.error);
        });
      }}
    >
      <input type="hidden" name="selection_id" value={selectionId} />
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Stake</span>
        <input
          className="input w-24 py-2"
          name="stake"
          type="number"
          min={10}
          defaultValue={50}
          required
        />
      </label>
      <SubmitButton className="text-sm">Apostar</SubmitButton>
      {error ? <p className="w-full text-xs text-[var(--danger)]">{error}</p> : null}
    </form>
  );
}
