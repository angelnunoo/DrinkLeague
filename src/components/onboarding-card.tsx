"use client";

import Link from "next/link";
import { useTransition } from "react";
import { dismissOnboardingAction } from "@/app/actions";

export type OnboardingMission = {
  code: string;
  title: string;
  description: string;
  emoji: string;
  reward_xp: number;
  reward_tokens: number;
  completed: boolean;
  claimed: boolean;
  sort_order: number;
};

const HREF: Record<string, string> = {
  first_drink: "/app#registrar",
  join_league: "/app/leagues",
  add_friend: "/app/social",
  first_game: "/app/games",
};

export function OnboardingCard({
  missions,
  done,
  total,
  compact,
}: {
  missions: OnboardingMission[];
  done: number;
  total: number;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  if (!missions.length || done >= total) return null;

  return (
    <div className="surface overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            Bienvenida
          </p>
          <h2 className="font-display text-2xl">🎉 Bienvenido a DrinkLeague</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Completa tus primeras misiones · {done}/{total}
          </p>
        </div>
        {!compact ? (
          <button
            type="button"
            disabled={pending}
            className="btn-ghost px-3 py-1 text-[10px]"
            onClick={() => start(() => dismissOnboardingAction())}
          >
            Más tarde
          </button>
        ) : null}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--line)]">
        <div
          className="h-full rounded-full bg-[var(--amber)] transition-all"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>

      <ul className="mt-4 space-y-2">
        {missions.map((m) => (
          <li key={m.code}>
            <Link
              href={HREF[m.code] ?? "/app"}
              className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2 transition ${
                m.completed
                  ? "border-[color-mix(in_srgb,var(--teal)_40%,transparent)] bg-[color-mix(in_srgb,var(--teal)_10%,transparent)]"
                  : "border-[var(--line)] hover:border-[var(--amber)]"
              }`}
            >
              <span className="text-xl" aria-hidden>
                {m.completed ? "✅" : m.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{m.title}</p>
                {!compact ? (
                  <p className="truncate text-[11px] text-[var(--muted)]">{m.description}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-[10px] text-[var(--amber)]">
                +{m.reward_xp} XP · ★{m.reward_tokens}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
