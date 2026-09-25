"use client";

import { useState, useTransition } from "react";
import { startGameAction } from "@/app/actions";
import { SubmitButton } from "@/components/auth-form";

const ART: Record<string, { emoji: string; className: string; tag: string }> = {
  peaje: { emoji: "🎡", className: "game-card-peaje", tag: "Suerte" },
  rey: { emoji: "👑", className: "game-card-rey", tag: "Cartas" },
  duelo: { emoji: "⚔️", className: "game-card-duelo", tag: "1 vs 1" },
};

export function StartGameForm({
  gameType,
  label,
  blurb,
  needsOpponent,
  compact,
}: {
  gameType: "peaje" | "rey" | "duelo";
  label: string;
  blurb?: string;
  needsOpponent?: boolean;
  compact?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const art = ART[gameType];

  if (compact) {
    return (
      <form
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            try {
              const r = await startGameAction(fd);
              if (r?.error) setError(r.error);
            } catch {
              /* redirect */
            }
          });
        }}
      >
        <input type="hidden" name="game_type" value={gameType} />
        <button type="submit" className="btn-ghost text-xs">
          {label}
        </button>
        {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      </form>
    );
  }

  return (
    <form
      className={`game-card ${art.className}`}
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          try {
            const r = await startGameAction(fd);
            if (r?.error) setError(r.error);
          } catch {
            /* redirect */
          }
        });
      }}
    >
      <input type="hidden" name="game_type" value={gameType} />
      <p className="absolute right-4 top-4 text-4xl opacity-90" aria-hidden>
        {art.emoji}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        {art.tag}
      </p>
      <h2 className="font-display text-3xl text-[var(--ink-strong)]">{label}</h2>
      {blurb ? <p className="mt-1 text-sm text-[var(--muted)]">{blurb}</p> : null}
      {needsOpponent ? (
        <input
          className="input mt-3"
          name="opponent_code"
          placeholder="Código amigo rival"
          required
          maxLength={12}
        />
      ) : null}
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      <SubmitButton className="mt-4 w-full text-base">Jugar ahora</SubmitButton>
    </form>
  );
}
