type RankRow = {
  user_id: string;
  display_name: string;
  points: number;
  level?: number;
  title?: string | null;
  avatar_url?: string | null;
  streak?: number;
  prev_rank?: number | null;
  rank: number;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Delta({ rank, prev }: { rank: number; prev?: number | null }) {
  if (prev == null) return <span className="text-[var(--muted)]">➖</span>;
  const d = prev - rank;
  if (d > 0) return <span className="text-[var(--teal)]">↑{d}</span>;
  if (d < 0) return <span className="text-[var(--danger)]">↓{Math.abs(d)}</span>;
  return <span className="text-[var(--muted)]">➖</span>;
}

export function VisualLeaderboard({
  rows,
  meId,
}: {
  rows: RankRow[];
  meId?: string;
}) {
  if (!rows.length) {
    return (
      <div className="surface p-6 text-center text-sm text-[var(--muted)]">
        Aún no hay clasificación. ¡Sé el primero!
      </div>
    );
  }

  const top = rows.filter((r) => r.rank <= 3);
  const byRank = new Map(top.map((r) => [r.rank, r]));
  const first = byRank.get(1);
  const second = byRank.get(2);
  const third = byRank.get(3);

  const meIdx = rows.findIndex((r) => r.user_id === meId);
  const meRank = meIdx >= 0 ? rows[meIdx].rank : null;
  const showContext = meRank != null && meRank > 6;
  const contextRows =
    showContext && meIdx >= 0
      ? rows.slice(Math.max(0, meIdx - 2), Math.min(rows.length, meIdx + 3))
      : [];

  const rest = rows.filter((r) => r.rank > 3 && (!showContext || Math.abs(r.rank - (meRank ?? 0)) > 2));

  return (
    <div className="space-y-5">
      {/* Big TOP 3 cards */}
      <div className="space-y-3">
        {first ? <TopCard row={first} place={1} meId={meId} /> : null}
        <div className="grid grid-cols-2 gap-3">
          {second ? <TopCard row={second} place={2} meId={meId} compact /> : null}
          {third ? <TopCard row={third} place={3} meId={meId} compact /> : null}
        </div>
      </div>

      {/* Weekly podium strip */}
      <div className="flex items-end justify-center gap-3 rounded-3xl border border-[var(--line)] bg-[rgba(7,16,14,0.45)] px-3 pt-4 pb-2">
        {[second, first, third].map((row, i) => {
          if (!row) return <div key={i} className="w-[28%]" />;
          const place = row.rank;
          const h = place === 1 ? "h-28" : place === 2 ? "h-20" : "h-16";
          const tone = place === 1 ? "podium-gold" : place === 2 ? "podium-silver" : "podium-bronze";
          const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
          return (
            <div key={row.user_id} className="flex w-[28%] flex-col items-center">
              <span className="mb-1 text-xl">{medal}</span>
              <p className="mb-1 line-clamp-1 text-center text-[10px] font-semibold">{row.display_name}</p>
              <div className={`podium-block ${tone} ${h} flex w-full items-start justify-center pt-2`}>
                <span className="font-display text-2xl">{place}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact 4+ */}
      <ol className="space-y-2">
        {(showContext ? rest : rows.filter((r) => r.rank > 3)).map((row) => (
          <li
            key={row.user_id}
            className={`rank-row flex items-center gap-3 px-3 py-3 ${
              row.user_id === meId ? "rank-row-me" : ""
            }`}
          >
            <span className="font-display w-8 text-center text-lg text-[var(--muted)]">#{row.rank}</span>
            <div className="avatar-ring flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold">
              {initials(row.display_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {row.display_name}
                {row.user_id === meId ? " (tú)" : ""}
              </p>
              <p className="text-[10px] text-[var(--muted)]">
                {row.title ?? `Nv. ${row.level ?? 1}`}
              </p>
            </div>
            <Delta rank={row.rank} prev={row.prev_rank} />
            <span className="font-display text-lg text-[var(--amber)]">{row.points}</span>
          </li>
        ))}
      </ol>

      {/* Personal context */}
      {showContext && contextRows.length ? (
        <div className="surface p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">📍 Tu posición</p>
          <p className="font-display text-2xl">
            #{meRank} {rows[meIdx!]?.display_name}
          </p>
          <ol className="mt-3 space-y-2">
            {contextRows.map((row) => (
              <li
                key={`ctx-${row.user_id}`}
                className={`rank-row flex items-center gap-3 px-3 py-2.5 ${
                  row.user_id === meId ? "rank-row-me" : ""
                }`}
              >
                <span className="w-8 font-display text-[var(--muted)]">#{row.rank}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {row.user_id === meId ? "Tú" : row.display_name}
                </span>
                <Delta rank={row.rank} prev={row.prev_rank} />
                <span className="font-display text-[var(--amber)]">{row.points}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function TopCard({
  row,
  place,
  meId,
  compact,
}: {
  row: RankRow;
  place: 1 | 2 | 3;
  meId?: string;
  compact?: boolean;
}) {
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
  const border =
    place === 1
      ? "border-[var(--gold)] shadow-[0_12px_40px_rgba(240,162,2,0.25)]"
      : place === 2
        ? "border-[var(--silver)]"
        : "border-[var(--bronze)]";
  const bg =
    place === 1
      ? "linear-gradient(145deg, rgba(255,213,106,0.35), rgba(240,162,2,0.12))"
      : place === 2
        ? "linear-gradient(145deg, rgba(197,208,204,0.28), rgba(7,16,14,0.7))"
        : "linear-gradient(145deg, rgba(212,146,90,0.3), rgba(7,16,14,0.7))";

  return (
    <div
      className={`rounded-3xl border ${border} p-4 ${compact ? "" : "animate-pop"}`}
      style={{ background: bg }}
    >
      <div className="flex items-center gap-3">
        <div
          className={`avatar-ring flex shrink-0 items-center justify-center font-bold ${
            place === 1 ? "avatar-ring-gold h-16 w-16 text-xl" : "h-12 w-12 text-sm"
          }`}
        >
          {row.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            initials(row.display_name)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            {medal} {place === 1 ? "Primer puesto" : place === 2 ? "Segundo" : "Tercero"}
          </p>
          <p className={`truncate font-display ${compact ? "text-xl" : "text-3xl"}`}>
            {row.display_name}
            {row.user_id === meId ? " · tú" : ""}
          </p>
          <p className="text-xs text-[var(--amber)]">{row.title ?? `Nv. ${row.level ?? 1}`}</p>
        </div>
        <div className="text-right">
          <p className={`font-display text-[var(--amber)] ${compact ? "text-2xl" : "text-4xl"}`}>
            {row.points}
          </p>
          {row.streak ? (
            <p className="text-[10px] text-[var(--teal)]">🔥 {row.streak}</p>
          ) : (
            <Delta rank={row.rank} prev={row.prev_rank} />
          )}
        </div>
      </div>
    </div>
  );
}
