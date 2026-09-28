"use client";

import { useMemo, useState } from "react";
import { purchaseShopItemAction, equipShopItemAction } from "@/app/actions";

export type ShopCardItem = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  tier: string | null;
  price_tokens: number;
};

type RarityKey = "common" | "rare" | "epic" | "legendary" | "mythic";

const RARITY_MAP: Record<string, RarityKey> = {
  cheap: "common",
  common: "common",
  medium: "rare",
  rare: "rare",
  epic: "epic",
  legendary: "legendary",
  mythic: "mythic",
};

const RARITY_META: Record<
  RarityKey,
  { label: string; emoji: string; stars: number; className: string }
> = {
  common: { label: "Común", emoji: "⚪", stars: 1, className: "shop-rarity-common" },
  rare: { label: "Raro", emoji: "🔵", stars: 2, className: "shop-rarity-rare" },
  epic: { label: "Épico", emoji: "🟣", stars: 3, className: "shop-rarity-epic" },
  legendary: { label: "Legendario", emoji: "🟡", stars: 4, className: "shop-rarity-legendary" },
  mythic: { label: "Mítico", emoji: "💎", stars: 5, className: "shop-rarity-mythic" },
};

const CATEGORY_EMOJI: Record<string, string> = {
  frame: "🖼️",
  banner: "🎨",
  avatar: "😎",
  theme: "🌈",
  effect: "✨",
  trophy: "🏆",
  vitrine: "📦",
  sticker: "🏷️",
  chest: "🎁",
  title: "👑",
};

const BANNER_PREVIEW: Record<string, string> = {
  banner_night: "linear-gradient(135deg,#0f172a,#1e1b4b 55%,#0b1512)",
  banner_premium_bar: "linear-gradient(135deg,#1a1208,#3a2208 40%,#0b1512)",
  banner_rare_storm: "linear-gradient(135deg,#0c4a6e,#1e3a5f 50%,#0b1512)",
  banner_founder: "linear-gradient(135deg,#2a1a00,#854d0e 40%,#7c2d12)",
};

function rarityOf(tier: string | null | undefined): RarityKey {
  return RARITY_MAP[(tier ?? "common").toLowerCase()] ?? "common";
}

function itemEmoji(item: ShopCardItem) {
  if (item.category === "chest") {
    const r = rarityOf(item.tier);
    if (r === "mythic") return "💎";
    if (r === "legendary") return "🟨";
    if (r === "epic") return "🟪";
    if (r === "rare") return "🟦";
    return "📦";
  }
  return CATEGORY_EMOJI[item.category] ?? "⭐";
}

export function PremiumShop({
  items,
  ownedMap,
  balance,
  displayName,
  currentTitle,
}: {
  items: ShopCardItem[];
  ownedMap: Record<string, boolean>;
  balance: number;
  displayName: string;
  currentTitle: string;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const featured = useMemo(() => {
    if (!items.length) return null;
    const day = Math.floor(Date.now() / 86_400_000);
    return items[day % items.length];
  }, [items]);

  const sections = useMemo(() => {
    const chests = items.filter((i) => i.category === "chest");
    const exclusives = items.filter(
      (i) =>
        rarityOf(i.tier) === "mythic" ||
        rarityOf(i.tier) === "legendary" ||
        /founder|casino|campeon|legend/i.test(i.sku),
    );
    const rest = items.filter((i) => !chests.includes(i));
    return { chests, exclusives, rest };
  }, [items]);

  const preview = items.find((i) => i.id === previewId) ?? featured;

  return (
    <div className="space-y-6">
      {/* Live preview showcase */}
      {preview ? (
        <div className="shop-preview-stage">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)]">
            Escaparate en vivo
          </p>
          <div
            className="shop-preview-banner"
            style={{
              background:
                BANNER_PREVIEW[preview.sku] ??
                (preview.category === "banner"
                  ? "linear-gradient(135deg,#1a2e28,#0b1512)"
                  : "linear-gradient(145deg, rgba(45,212,191,0.2), rgba(240,162,2,0.14))"),
            }}
          >
            <div className={`shop-preview-avatar frame-preview-${rarityOf(preview.tier)}`}>
              {preview.category === "avatar" ? itemEmoji(preview) : displayName.slice(0, 1)}
            </div>
            <div>
              <p className="text-[10px] text-[var(--amber)]">
                {preview.category === "title" ? preview.name : currentTitle}
              </p>
              <p className="font-display text-2xl">{displayName}</p>
              <p className="text-xs text-[var(--muted)]">
                Previsualizando · {preview.name}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {featured ? (
        <ShopProductCard
          item={featured}
          owned={ownedMap[featured.id] != null}
          equipped={ownedMap[featured.id] === true}
          balance={balance}
          featured
          onPreview={() => setPreviewId(featured.id)}
          opening={openingId === featured.id}
          onOpenAnim={() => {
            setOpeningId(featured.id);
            window.setTimeout(() => setOpeningId(null), 900);
          }}
        />
      ) : null}

      {sections.chests.length ? (
        <div className="space-y-3">
          <h2 className="font-display text-2xl">🎁 Cofres</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {sections.chests.map((item) => (
              <ShopProductCard
                key={item.id}
                item={item}
                owned={ownedMap[item.id] != null}
                equipped={ownedMap[item.id] === true}
                balance={balance}
                onPreview={() => setPreviewId(item.id)}
                opening={openingId === item.id}
                onOpenAnim={() => {
                  setOpeningId(item.id);
                  window.setTimeout(() => setOpeningId(null), 900);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {sections.exclusives.length ? (
        <div className="space-y-3">
          <h2 className="font-display text-2xl">👑 Exclusivos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {sections.exclusives.map((item) => (
              <ShopProductCard
                key={item.id}
                item={item}
                owned={ownedMap[item.id] != null}
                equipped={ownedMap[item.id] === true}
                balance={balance}
                onPreview={() => setPreviewId(item.id)}
                opening={openingId === item.id}
                onOpenAnim={() => {
                  setOpeningId(item.id);
                  window.setTimeout(() => setOpeningId(null), 900);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="font-display text-2xl">🛒 Catálogo</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {sections.rest.map((item) => (
            <ShopProductCard
              key={item.id}
              item={item}
              owned={ownedMap[item.id] != null}
              equipped={ownedMap[item.id] === true}
              balance={balance}
              onPreview={() => setPreviewId(item.id)}
              opening={openingId === item.id}
              onOpenAnim={() => {
                setOpeningId(item.id);
                window.setTimeout(() => setOpeningId(null), 900);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ShopProductCard({
  item,
  owned,
  equipped,
  balance,
  featured,
  onPreview,
  opening,
  onOpenAnim,
}: {
  item: ShopCardItem;
  owned: boolean;
  equipped: boolean;
  balance: number;
  featured?: boolean;
  onPreview: () => void;
  opening: boolean;
  onOpenAnim: () => void;
}) {
  const rarity = rarityOf(item.tier);
  const meta = RARITY_META[rarity];
  const canBuy = !owned && balance >= item.price_tokens;
  const isChest = item.category === "chest";

  return (
    <article
      className={`shop-card ${meta.className} ${featured ? "shop-card-featured" : ""} ${
        opening ? "shop-card-opening" : ""
      }`}
      onMouseEnter={onPreview}
      onFocus={onPreview}
    >
      {featured ? (
        <p className="shop-badge-day">🔥 Producto del Día</p>
      ) : null}
      <div className="shop-card-art" aria-hidden>
        <span className={`shop-card-emoji ${isChest ? "shop-chest" : ""}`}>
          {itemEmoji(item)}
        </span>
        <div className="shop-card-sparkles" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em]">
        {meta.emoji} {meta.label}
      </p>
      <h3 className="font-display text-2xl leading-tight">{item.name}</h3>
      <p className="text-xs capitalize text-[var(--muted)]">
        {item.category} · {item.description ?? "Cosmético"}
      </p>
      <p className="mt-1 tracking-widest text-[var(--amber)]">
        {"⭐".repeat(meta.stars)}
      </p>
      <p className="mt-2 font-display text-2xl text-[var(--amber)]">
        {item.price_tokens.toLocaleString("es-ES")} ★
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost min-h-11 text-xs" onClick={onPreview}>
          Ver
        </button>
        {owned ? (
          equipped ? (
            <span className="rounded-full border border-[var(--teal)] px-4 py-2 text-sm text-[var(--teal)]">
              Equipado
            </span>
          ) : (
            <form action={equipShopItemAction.bind(null, item.id)}>
              <button type="submit" className="btn-ghost text-sm" onClick={onOpenAnim}>
                Equipar
              </button>
            </form>
          )
        ) : (
          <form action={purchaseShopItemAction.bind(null, item.id)}>
            <button
              type="submit"
              className="btn-primary text-sm"
              disabled={!canBuy}
              onClick={onOpenAnim}
            >
              {canBuy ? "Comprar" : "Sin fichas"}
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
