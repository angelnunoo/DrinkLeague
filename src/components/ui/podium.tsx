type PodiumRow = {
  user_id: string;
  display_name: string;
  points: number;
  level?: number;
  avatar_url?: string | null;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function RankingPodium({
  rows,
  meId,
}: {
  rows: PodiumRow[];
  meId?: string;
}) {
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const order = [top[1], top[0], top[2]].filter(Boolean) as PodiumRow[];
  const heights = ["h-24", "h-32", "h-20"];
  const medals = ["🥈", "🥇", "🥉"];
  const tones = ["podium-silver", "podium-gold", "podium-bronze"];

  if (!top.length) {
    return (
      <div className="surface p-6 text-center text-sm text-[var(--muted)]">
        Aún no hay clasificación. ¡Sé el primero en registrar!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-center gap-2 px-1 pt-2">
        {order.map((row, i) => {
          const place = row === top[0] ? 1 : row === top[1] ? 2 : 3;
          const idx = place === 1 ? 1 : place === 2 ? 0 : 2;
          const isMe = row.user_id === meId;
          return (
            <div key={row.user_id} className="flex w-[30%] max-w-[7.5rem] flex-col items-center">
              <div
                className={`avatar-ring mb-2 flex h-14 w-14 items-center justify-center text-lg font-bold ${
                  place === 1 ? "avatar-ring-gold" : ""
                }`}
              >
                {row.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  initials(row.display_name)
                )}
              </div>
              <p className="mb-1 line-clamp-1 text-center text-xs font-semibold">
                {row.display_name}
                {isMe ? " · tú" : ""}
              </p>
              <p className="mb-2 font-display text-lg text-[var(--amber)]">{row.points}</p>
              <div
                className={`podium-block ${tones[idx]} ${heights[idx]} flex w-full flex-col items-center justify-start pt-2`}
              >
                <span className="text-xl">{medals[idx]}</span>
                <span className="font-display text-2xl">{place}</span>
              </div>
            </div>
          );
        })}
      </div>

      {rest.length ? (
        <ol className="space-y-2">
          {rest.map((row, i) => {
            const place = i + 4;
            const isMe = row.user_id === meId;
            return (
              <li
                key={row.user_id}
                className={`rank-row flex items-center gap-3 px-3 py-3 ${
                  isMe ? "rank-row-me" : ""
                }`}
              >
                <span className="font-display w-7 text-center text-lg text-[var(--muted)]">
                  {place}
                </span>
                <div className="avatar-ring flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold">
                  {initials(row.display_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {row.display_name}
                    {isMe ? " (tú)" : ""}
                  </p>
                  {row.level != null ? (
                    <p className="text-[10px] text-[var(--muted)]">Nv. {row.level}</p>
                  ) : null}
                </div>
                <span className="font-display text-xl text-[var(--amber)]">{row.points}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
