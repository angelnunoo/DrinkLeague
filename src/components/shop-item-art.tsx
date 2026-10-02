type RarityKey = "common" | "rare" | "epic" | "legendary" | "mythic";

export function ShopItemArt({
  category,
  sku,
  rarity,
  size = "md",
}: {
  category: string;
  sku: string;
  rarity: RarityKey;
  size?: "sm" | "md" | "lg";
}) {
  if (category === "chest") {
    return <ChestArt rarity={rarity} size={size} />;
  }

  const sizeClass = size === "lg" ? "shop-art-lg" : size === "sm" ? "shop-art-sm" : "shop-art-md";

  return (
    <span className={`shop-art ${sizeClass} shop-art-${category} shop-art-rarity-${rarity}`} data-sku={sku}>
      <span className="shop-art-core" aria-hidden />
      <span className="shop-art-shine" aria-hidden />
    </span>
  );
}

export function ChestArt({
  rarity,
  size = "md",
  open = false,
  shaking = false,
}: {
  rarity: RarityKey;
  size?: "sm" | "md" | "lg" | "xl";
  open?: boolean;
  shaking?: boolean;
}) {
  const sizeClass =
    size === "xl"
      ? "chest-art-xl"
      : size === "lg"
        ? "chest-art-lg"
        : size === "sm"
          ? "chest-art-sm"
          : "chest-art-md";

  return (
    <span
      className={`chest-art ${sizeClass} chest-${rarity} ${open ? "is-open" : ""} ${
        shaking ? "is-shaking" : ""
      }`}
      aria-hidden
    >
      <span className="chest-glow" />
      <span className="chest-body">
        <span className="chest-band" />
        <span className="chest-lock" />
        <span className="chest-rivet chest-rivet-l" />
        <span className="chest-rivet chest-rivet-r" />
      </span>
      <span className="chest-lid">
        <span className="chest-lid-inner" />
        <span className="chest-gem" />
      </span>
      <span className="chest-burst" />
    </span>
  );
}
