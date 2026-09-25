export type BarDatum = { label: string; value: number; color?: string };

export function BarChart({
  data,
  height = 140,
  unit = "",
}: {
  data: BarDatum[];
  height?: number;
  unit?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  if (!data.length) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">Sin datos aún</p>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <div className="flex h-full items-end gap-1.5 sm:gap-2">
        {data.map((d) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="font-display text-[11px] tabular-nums text-[var(--amber)]">
                {d.value}
                {unit}
              </span>
              <div className="relative w-full flex-1 rounded-t-lg bg-[rgba(7,16,14,0.55)]">
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-500"
                  style={{
                    height: `${Math.max(pct, 4)}%`,
                    background:
                      d.color ??
                      "linear-gradient(180deg, var(--amber), color-mix(in srgb, var(--teal) 70%, var(--amber)))",
                    boxShadow: "0 0 12px color-mix(in srgb, var(--amber) 35%, transparent)",
                  }}
                />
              </div>
              <span className="w-full truncate text-center text-[9px] uppercase tracking-wide text-[var(--muted)]">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HorizontalBars({ data }: { data: BarDatum[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (!data.length) {
    return <p className="text-sm text-[var(--muted)]">Sin datos aún</p>;
  }
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="truncate font-semibold">{d.label}</span>
            <span className="font-display text-[var(--amber)]">{d.value}</span>
          </div>
          <div className="xp-track h-2.5">
            <div
              className="xp-fill"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: d.color ?? "var(--teal)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Simple sparkline from values (oldest → newest). */
export function Sparkline({
  values,
  stroke = "var(--teal)",
}: {
  values: number[];
  stroke?: string;
}) {
  if (values.length < 2) {
    return (
      <div className="flex h-16 items-center justify-center text-xs text-[var(--muted)]">
        Necesitas más actividad
      </div>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const w = 280;
  const h = 64;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
      <polyline
        fill={`color-mix(in srgb, ${stroke} 18%, transparent)`}
        stroke="none"
        points={`0,${h} ${pts} ${w},${h}`}
      />
    </svg>
  );
}
