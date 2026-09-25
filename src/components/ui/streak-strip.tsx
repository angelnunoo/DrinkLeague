export type StreakItem = {
  type: string;
  label: string;
  emoji: string;
  count: number;
};

const LABELS: Record<string, { label: string; emoji: string }> = {
  active_days: { label: "días activos", emoji: "🔥" },
  log_weeks: { label: "semanas registrando", emoji: "🍺" },
  mvp: { label: "MVP", emoji: "⚡" },
  game_weeks: { label: "semanas jugando", emoji: "🎮" },
};

export function StreakStrip({ streaks }: { streaks: Array<{ streak_type: string; current_count: number }> }) {
  const items = streaks
    .filter((s) => s.current_count > 0)
    .map((s) => {
      const meta = LABELS[s.streak_type] ?? { label: s.streak_type, emoji: "✨" };
      return {
        type: s.streak_type,
        label: meta.label,
        emoji: meta.emoji,
        count: s.current_count,
      };
    });

  if (!items.length) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="stat-chip shrink-0 px-4 py-3">
          <p className="text-sm text-[var(--muted)]">Empieza tu racha hoy 🔥</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((s) => (
        <div
          key={s.type}
          className="shrink-0 rounded-2xl border border-[var(--amber)]/40 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-4 py-3"
        >
          <p className="text-2xl leading-none">{s.emoji}</p>
          <p className="mt-1 font-display text-2xl text-[var(--amber)]">{s.count}</p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
