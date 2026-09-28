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

export const SUIT_META: Record<string, { label: string; symbol: string; color: string }> = {
  oros: { label: "Oros", symbol: "🪙", color: "#f0a202" },
  copas: { label: "Copas", symbol: "🍷", color: "#fb7185" },
  espadas: { label: "Espadas", symbol: "⚔️", color: "#7dd3fc" },
  bastos: { label: "Bastos", symbol: "🪵", color: "#86efac" },
};

export function cardTitle(card: SpanishCard | null | undefined) {
  if (!card) return "—";
  if (card.label) return card.label;
  const rank = RANK_LABELS[card.rank] ?? String(card.rank);
  const suit = SUIT_META[card.suit]?.label ?? card.suit;
  return `${rank} de ${suit}`;
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
    size === "lg" ? "w-40 min-h-[14rem]" : size === "sm" ? "w-24 min-h-[9rem]" : "w-32 min-h-[12rem]";
  const suit = card ? SUIT_META[card.suit] : null;

  if (faceDown || !card) {
    return (
      <div
        className={`playing-card ${dims} border-[var(--amber)]`}
        style={{
          background:
            "repeating-linear-gradient(45deg, #1a2e28, #1a2e28 8px, #12241f 8px, #12241f 16px)",
        }}
      >
        <p className="font-display text-3xl text-[var(--amber)]">🍺</p>
      </div>
    );
  }

  return (
    <div
      className={`playing-card ${dims} animate-pop`}
      style={{ borderColor: suit?.color ?? "var(--line)" }}
    >
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: suit?.color }}>
        {suit?.symbol} {suit?.label}
      </p>
      <p className="mt-2 font-display text-4xl text-[var(--ink-strong)] sm:text-5xl">
        {RANK_LABELS[card.rank] ?? card.name ?? card.rank}
      </p>
      <p className="mt-2 px-2 text-center text-[10px] text-[var(--muted)]">{cardTitle(card)}</p>
    </div>
  );
}
