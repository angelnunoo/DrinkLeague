import type { CSSProperties } from "react";

export type PokerCard = {
  rank: number;
  suit: "spades" | "hearts" | "diamonds" | "clubs" | string;
  label?: string;
  value?: number;
};

export const POKER_RANK_LABELS: Record<number, string> = {
  1: "A",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
};

export const POKER_SUIT_META: Record<
  string,
  { label: string; symbol: string; color: string; red: boolean }
> = {
  spades: { label: "Picas", symbol: "♠", color: "#0f172a", red: false },
  hearts: { label: "Corazones", symbol: "♥", color: "#dc2626", red: true },
  diamonds: { label: "Diamantes", symbol: "♦", color: "#dc2626", red: true },
  clubs: { label: "Tréboles", symbol: "♣", color: "#0f172a", red: false },
};

const FIGURE_GLYPH: Record<number, string> = {
  1: "A",
  11: "J",
  12: "Q",
  13: "K",
};

function PipGrid({
  rank,
  color,
  symbol,
}: {
  rank: number;
  color: string;
  symbol: string;
}) {
  const count = Math.min(Math.max(rank, 1), 10);
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
                : count === 7
                  ? ["tl", "tr", "ml", "c", "mr", "bl", "br"]
                  : count === 8
                    ? ["tl", "tr", "mtl", "mtr", "mbl", "mbr", "bl", "br"]
                    : count === 9
                      ? ["tl", "tr", "mtl", "mtr", "c", "mbl", "mbr", "bl", "br"]
                      : ["tl", "tr", "mtl", "mtr", "ml", "mr", "mbl", "mbr", "bl", "br"];

  return (
    <div className="poker-pips" aria-hidden>
      {slots.map((pos, i) => (
        <span key={`${pos}-${i}`} className={`pip pip-${pos}`} style={{ color }}>
          {symbol}
        </span>
      ))}
    </div>
  );
}

export function PokerPlayingCard({
  card,
  size = "md",
  faceDown,
  dealDelay = 0,
  flip,
}: {
  card?: PokerCard | null;
  size?: "sm" | "md" | "lg";
  faceDown?: boolean;
  dealDelay?: number;
  flip?: boolean;
}) {
  const dims =
    size === "lg"
      ? "w-[7.25rem] min-h-[10.75rem] sm:w-36 sm:min-h-[13.5rem]"
      : size === "sm"
        ? "w-[4.25rem] min-h-[6.4rem]"
        : "w-[5.75rem] min-h-[8.6rem] sm:w-28 sm:min-h-[10.5rem]";

  const style: CSSProperties = {
    animationDelay: dealDelay > 0 ? `${dealDelay}ms` : undefined,
  };

  if (faceDown || !card) {
    return (
      <div
        className={`poker-card playing-card playing-card-back poker-card-back ${dims} ${
          dealDelay > 0 ? "bj-deal" : ""
        } ${flip ? "bj-flip" : ""}`}
        style={style}
      >
        <div className="playing-card-back-inner poker-back-inner">
          <p className="text-3xl sm:text-4xl">🃏</p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--amber)]">
            BlackJack
          </p>
        </div>
      </div>
    );
  }

  const suit = POKER_SUIT_META[card.suit] ?? {
    label: card.suit,
    symbol: "•",
    color: "#0f172a",
    red: false,
  };
  const rankLabel = card.label ?? POKER_RANK_LABELS[card.rank] ?? String(card.rank);
  const isFigure = card.rank === 1 || card.rank >= 11;
  const color = suit.color;

  return (
    <div
      className={`poker-card playing-card playing-card-face poker-card-face ${dims} ${
        dealDelay > 0 ? "bj-deal" : "animate-pop"
      } ${flip ? "bj-flip" : ""}`}
      style={{ ...style, borderColor: color }}
      aria-label={`${rankLabel} de ${suit.label}`}
    >
      <div className="card-corner card-corner-tl" style={{ color }}>
        <span className="card-corner-rank poker-rank">{rankLabel}</span>
        <span className="card-corner-suit">{suit.symbol}</span>
      </div>

      <div className="card-face-center">
        {isFigure ? (
          <div className="card-figure" style={{ color }}>
            <p className="poker-figure-art">{FIGURE_GLYPH[card.rank] ?? rankLabel}</p>
            <p className="poker-figure-suit">{suit.symbol}</p>
          </div>
        ) : (
          <PipGrid rank={card.rank} color={color} symbol={suit.symbol} />
        )}
      </div>

      <div className="card-corner card-corner-br" style={{ color }}>
        <span className="card-corner-rank poker-rank">{rankLabel}</span>
        <span className="card-corner-suit">{suit.symbol}</span>
      </div>
    </div>
  );
}
