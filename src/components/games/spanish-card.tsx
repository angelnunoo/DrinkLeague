export type SpanishCard = {
  rank: number;
  suit: "oros" | "copas" | "espadas" | "bastos" | string;
  name?: string;
  label?: string;
};

export const RANK_LABELS: Record<number, string> = {
  1: "As",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "Sota",
  9: "Caballo",
  10: "Rey",
};

export const SUIT_META: Record<
  string,
  { label: string; symbol: string; color: string; pip: string }
> = {
  oros: { label: "Oros", symbol: "🪙", color: "#c9920a", pip: "●" },
  copas: { label: "Copas", symbol: "🍷", color: "#c43b55", pip: "♥" },
  espadas: { label: "Espadas", symbol: "⚔️", color: "#2f6fed", pip: "♠" },
  bastos: { label: "Bastos", symbol: "🪵", color: "#2f9e5b", pip: "♣" },
};

const FIGURE_ART: Record<number, string> = {
  1: "🅰️",
  8: "🗡️",
  9: "🐴",
  10: "👑",
};

export function cardTitle(card: SpanishCard | null | undefined) {
  if (!card) return "—";
  if (card.label) return card.label;
  const rank = RANK_LABELS[card.rank] ?? String(card.rank);
  const suit = SUIT_META[card.suit]?.label ?? card.suit;
  return `${rank} de ${suit}`;
}

function PipGrid({ rank, color, pip }: { rank: number; color: string; pip: string }) {
  const count = Math.min(Math.max(rank, 1), 7);
  const slots =
    count === 1
      ? ["c"]
      : count === 2
        ? ["t", "b"]
        : count === 3
          ? ["t", "c", "b"]
          : count === 4
            ? ["tl", "tr", "bl", "br"]
            : count === 5
              ? ["tl", "tr", "c", "bl", "br"]
              : count === 6
                ? ["tl", "tr", "ml", "mr", "bl", "br"]
                : ["tl", "tr", "ml", "c", "mr", "bl", "br"];

  return (
    <div className="spanish-pips" aria-hidden>
      {slots.map((pos, i) => (
        <span key={`${pos}-${i}`} className={`pip pip-${pos}`} style={{ color }}>
          {pip}
        </span>
      ))}
    </div>
  );
}

export function SpanishPlayingCard({
  card,
  size = "md",
  faceDown,
}: {
  card?: SpanishCard | null;
  size?: "sm" | "md" | "lg";
  faceDown?: boolean;
}) {
  const dims =
    size === "lg" ? "w-44 min-h-[16rem]" : size === "sm" ? "w-24 min-h-[9rem]" : "w-36 min-h-[13rem]";
  const suit = card ? SUIT_META[card.suit] : null;
  const isFigure = card ? card.rank === 1 || card.rank >= 8 : false;

  if (faceDown || !card) {
    return (
      <div className={`playing-card playing-card-back ${dims}`}>
        <div className="playing-card-back-inner">
          <p className="text-4xl">🍺</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--amber)]">
            DrinkLeague
          </p>
        </div>
      </div>
    );
  }

  const color = suit?.color ?? "#888";
  const pip = suit?.pip ?? "•";
  const corner = RANK_LABELS[card.rank] ?? String(card.rank);

  return (
    <div
      className={`playing-card playing-card-face ${dims} animate-pop`}
      style={{ borderColor: color }}
    >
      <div className="card-corner card-corner-tl" style={{ color }}>
        <span className="card-corner-rank">{corner}</span>
        <span className="card-corner-suit">{suit?.symbol}</span>
      </div>

      <div className="card-face-center">
        {isFigure ? (
          <div className="card-figure" style={{ color }}>
            <p className="card-figure-art">{FIGURE_ART[card.rank] ?? suit?.symbol}</p>
            <p className="card-figure-name">{RANK_LABELS[card.rank]}</p>
            <p className="card-figure-suit">
              {suit?.symbol} {suit?.label}
            </p>
          </div>
        ) : (
          <PipGrid rank={card.rank} color={color} pip={pip} />
        )}
      </div>

      <div className="card-corner card-corner-br" style={{ color }}>
        <span className="card-corner-rank">{corner}</span>
        <span className="card-corner-suit">{suit?.symbol}</span>
      </div>
    </div>
  );
}
