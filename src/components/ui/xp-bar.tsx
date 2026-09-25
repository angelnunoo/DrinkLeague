export function XpBar({
  ratio,
  label,
  accent = "teal",
  size = "md",
}: {
  ratio: number;
  label?: string;
  accent?: "teal" | "amber" | "gold";
  size?: "sm" | "md" | "lg";
}) {
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const h = size === "lg" ? "h-4" : size === "sm" ? "h-2" : "h-3";
  const color =
    accent === "amber"
      ? "var(--amber)"
      : accent === "gold"
        ? "var(--gold)"
        : "var(--teal)";

  return (
    <div className="w-full">
      {label ? (
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--muted)]">
          <span>{label}</span>
          <span className="tabular-nums text-[var(--ink)]">{pct}%</span>
        </div>
      ) : null}
      <div className={`xp-track ${h}`}>
        <div
          className="xp-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
