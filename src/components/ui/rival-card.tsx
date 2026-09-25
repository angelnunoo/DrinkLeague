type RivalData = {
  rival_name: string;
  points_delta: number;
  seasons_me: number;
  seasons_rival: number;
  duels_me: number;
  duels_rival: number;
  my_rank?: number | null;
  rival_rank?: number | null;
};

export function RivalCard({ rival }: { rival: RivalData | null }) {
  if (!rival) {
    return (
      <div className="surface p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
          ⚔️ Tu Rival
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Necesitas más rivales en la liga para detectar uno automático.
        </p>
      </div>
    );
  }

  const ahead = rival.points_delta >= 0;

  return (
    <div
      className="overflow-hidden rounded-3xl border border-[var(--danger)]/40 p-4"
      style={{
        background:
          "linear-gradient(145deg, rgba(251,113,133,0.18), rgba(240,162,2,0.08), rgba(7,16,14,0.92))",
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--danger)]">
        ⚔️ Tu Rival
      </p>
      <h2 className="mt-1 font-display text-3xl text-[var(--ink-strong)]">{rival.rival_name}</h2>
      {(rival.my_rank || rival.rival_rank) && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Tú #{rival.my_rank ?? "—"} · Rival #{rival.rival_rank ?? "—"}
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="stat-chip text-center">
          <p className="text-[9px] uppercase text-[var(--muted)]">Diff pts</p>
          <p className={`font-display text-xl ${ahead ? "text-[var(--teal)]" : "text-[var(--danger)]"}`}>
            {ahead ? "+" : ""}
            {rival.points_delta}
          </p>
        </div>
        <div className="stat-chip text-center">
          <p className="text-[9px] uppercase text-[var(--muted)]">Temporadas</p>
          <p className="font-display text-xl">
            {rival.seasons_me} - {rival.seasons_rival}
          </p>
        </div>
        <div className="stat-chip text-center">
          <p className="text-[9px] uppercase text-[var(--muted)]">Duelos</p>
          <p className="font-display text-xl">
            {rival.duels_me} - {rival.duels_rival}
          </p>
        </div>
      </div>
    </div>
  );
}
