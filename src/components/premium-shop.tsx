"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  purchaseShopItemAction,
  equipShopItemAction,
  openShopChestAction,
} from "@/app/actions";
import { ChestArt, ShopItemArt } from "@/components/shop-item-art";

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
type FilterKey =
  | "all"
  | "owned"
  | "chest"
  | "frame"
  | "banner"
  | "title"
  | "avatar"
  | "effect"
  | "other";

type ChestLoot = {
  ok?: boolean;
  chest_sku?: string;
  chest_name?: string;
  kind?: string;
  amount?: number;
  reward_id?: string;
  reward_sku?: string;
  reward_name?: string;
  reward_category?: string;
  reward_tier?: string;
  label?: string;
};

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
  { label: string; stars: number; className: string }
> = {
  common: { label: "Común", stars: 1, className: "shop-rarity-common" },
  rare: { label: "Raro", stars: 2, className: "shop-rarity-rare" },
  epic: { label: "Épico", stars: 3, className: "shop-rarity-epic" },
  legendary: { label: "Legendario", stars: 4, className: "shop-rarity-legendary" },
  mythic: { label: "Mítico", stars: 5, className: "shop-rarity-mythic" },
};

const CATEGORY_META: Record<string, { label: string }> = {
  frame: { label: "Marco" },
  banner: { label: "Banner" },
  avatar: { label: "Avatar" },
  theme: { label: "Tema" },
  effect: { label: "Efecto" },
  trophy: { label: "Trofeo" },
  vitrine: { label: "Vitrina" },
  sticker: { label: "Sticker" },
  chest: { label: "Cofre" },
  title: { label: "Título" },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "owned", label: "Míos" },
  { key: "chest", label: "Cofres" },
  { key: "frame", label: "Marcos" },
  { key: "banner", label: "Banners" },
  { key: "title", label: "Títulos" },
  { key: "avatar", label: "Avatares" },
  { key: "effect", label: "Efectos" },
  { key: "other", label: "Más" },
];

const BANNER_PREVIEW: Record<string, string> = {
  banner_night: "linear-gradient(135deg,#0f172a,#1e1b4b 55%,#0b1512)",
  banner_premium_bar: "linear-gradient(135deg,#1a1208,#3a2208 40%,#0b1512)",
  banner_rare_storm: "linear-gradient(135deg,#0c4a6e,#1e3a5f 50%,#0b1512)",
  banner_founder: "linear-gradient(135deg,#2a1a00,#854d0e 40%,#7c2d12)",
  banner_weekend_party: "linear-gradient(135deg,#7c2d12,#f0a202 45%,#0b1512)",
};

const CHEST_SKU_RARITY: Record<string, RarityKey> = {
  chest_common: "common",
  chest_rare: "rare",
  chest_epic: "epic",
  chest_legendary: "legendary",
  chest_mythic: "mythic",
};

function rarityOf(tier: string | null | undefined): RarityKey {
  return RARITY_MAP[(tier ?? "common").toLowerCase()] ?? "common";
}

function chestRarity(item: ShopCardItem): RarityKey {
  return CHEST_SKU_RARITY[item.sku] ?? rarityOf(item.tier);
}

function categoryLabel(cat: string) {
  return CATEGORY_META[cat]?.label ?? cat;
}

function isExclusive(item: ShopCardItem) {
  const r = rarityOf(item.tier);
  return (
    r === "mythic" ||
    r === "legendary" ||
    /founder|casino|campeon|legend/i.test(item.sku)
  );
}

function matchesFilter(item: ShopCardItem, filter: FilterKey, owned: boolean) {
  if (filter === "all") return true;
  if (filter === "owned") return owned;
  if (filter === "other") {
    return !["chest", "frame", "banner", "title", "avatar", "effect"].includes(
      item.category,
    );
  }
  return item.category === filter;
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [chestPhase, setChestPhase] = useState<"idle" | "shake" | "open" | "reveal">(
    "idle",
  );
  const [activeChest, setActiveChest] = useState<ShopCardItem | null>(null);
  const [loot, setLoot] = useState<ChestLoot | null>(null);
  const [chestError, setChestError] = useState<string | null>(null);

  const featured =
    items.length > 0 ? items[Math.floor(Date.now() / 86_400_000) % items.length] : null;
  const featuredId = featured?.id;

  const chests = items.filter((i) => i.category === "chest" && i.id !== featuredId);
  const exclusives = items.filter(
    (i) => i.category !== "chest" && isExclusive(i) && i.id !== featuredId,
  );
  const catalog = items.filter(
    (i) => i.category !== "chest" && !isExclusive(i) && i.id !== featuredId,
  );

  const filtered = items.filter((i) =>
    matchesFilter(i, filter, ownedMap[i.id] != null),
  );

  const preview =
    items.find((i) => i.id === previewId) ?? featured ?? items[0] ?? null;
  const ownedCount = items.filter((i) => ownedMap[i.id] != null).length;

  function closeChest() {
    setChestPhase("idle");
    setActiveChest(null);
    setLoot(null);
    setChestError(null);
    router.refresh();
  }

  function openChest(item: ShopCardItem) {
    if (pending || chestPhase !== "idle") return;
    if (balance < item.price_tokens) {
      setChestError("No tienes fichas suficientes.");
      setActiveChest(item);
      setChestPhase("reveal");
      return;
    }
    setChestError(null);
    setActiveChest(item);
    setLoot(null);
    setChestPhase("shake");

    startTransition(async () => {
      const res = await openShopChestAction(item.id);
      if (res.error) {
        setChestError(res.error);
        setChestPhase("reveal");
        return;
      }
      const payload = (res.payload ?? {}) as ChestLoot;
      window.setTimeout(() => {
        setChestPhase("open");
        window.setTimeout(() => {
          setLoot(payload);
          setChestPhase("reveal");
        }, 900);
      }, 1100);
    });
  }

  if (!items.length) {
    return (
      <div className="surface space-y-3 p-6 text-center">
        <p className="font-display text-2xl">Tienda en descanso</p>
        <p className="text-sm text-[var(--muted)]">
          Pronto habrá cosméticos nuevos. Mientras tanto, gana fichas en el casino.
        </p>
        <Link
          href="/app/casino"
          className="btn-primary mt-2 inline-flex min-h-12 items-center px-6 text-sm"
        >
          Ir a DrinkCasino
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {preview ? (
        <div className="shop-preview-stage">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)]">
              Escaparate en vivo
            </p>
            <p className="text-[10px] text-[var(--muted)]">
              {ownedCount}/{items.length} en inventario
            </p>
          </div>
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
              {preview.category === "avatar" || preview.category === "chest" ? (
                <ShopItemArt
                  category={preview.category}
                  sku={preview.sku}
                  rarity={
                    preview.category === "chest"
                      ? chestRarity(preview)
                      : rarityOf(preview.tier)
                  }
                  size="sm"
                />
              ) : (
                displayName.slice(0, 1)
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-[var(--amber)]">
                {preview.category === "title" ? preview.name : currentTitle}
              </p>
              <p className="truncate font-display text-2xl">{displayName}</p>
              <p className="text-xs text-[var(--muted)]">
                Previsualizando · {preview.name}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {featured && filter === "all" ? (
        <ShopProductCard
          item={featured}
          owned={ownedMap[featured.id] != null}
          equipped={ownedMap[featured.id] === true}
          balance={balance}
          featured
          pending={pending}
          onPreview={() => setPreviewId(featured.id)}
          onOpenChest={() => openChest(featured)}
        />
      ) : null}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`min-h-11 shrink-0 rounded-2xl border px-3.5 py-2.5 text-sm font-semibold transition ${
              filter === f.key
                ? "border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_14%,transparent)] text-[var(--ink-strong)]"
                : "border-[var(--line)] text-[var(--muted)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filter !== "all" ? (
        <ShopGrid
          title={FILTERS.find((f) => f.key === filter)?.label ?? "Catálogo"}
          items={filtered}
          ownedMap={ownedMap}
          balance={balance}
          pending={pending}
          emptyHint={
            filter === "owned"
              ? "Aún no tienes cosméticos. ¡Compra el primero!"
              : "Nada en esta categoría por ahora."
          }
          onPreview={setPreviewId}
          onOpenChest={openChest}
        />
      ) : (
        <>
          {chests.length ? (
            <ShopGrid
              title="Cofres"
              subtitle="Pagas fichas al abrir · premio al instante"
              items={chests}
              ownedMap={ownedMap}
              balance={balance}
              pending={pending}
              onPreview={setPreviewId}
              onOpenChest={openChest}
            />
          ) : null}

          {exclusives.length ? (
            <ShopGrid
              title="Exclusivos"
              subtitle="Legendario y mítico"
              items={exclusives}
              ownedMap={ownedMap}
              balance={balance}
              pending={pending}
              onPreview={setPreviewId}
              onOpenChest={openChest}
            />
          ) : null}

          <ShopGrid
            title="Catálogo"
            subtitle="Cosméticos para lucir"
            items={catalog}
            ownedMap={ownedMap}
            balance={balance}
            pending={pending}
            emptyHint="El catálogo está vacío."
            onPreview={setPreviewId}
            onOpenChest={openChest}
          />
        </>
      )}

      {activeChest && chestPhase !== "idle" ? (
        <ChestOpenOverlay
          chest={activeChest}
          phase={chestPhase}
          loot={loot}
          error={chestError}
          pending={pending}
          onClose={closeChest}
        />
      ) : null}
    </div>
  );
}

function ChestOpenOverlay({
  chest,
  phase,
  loot,
  error,
  pending,
  onClose,
}: {
  chest: ShopCardItem;
  phase: "shake" | "open" | "reveal";
  loot: ChestLoot | null;
  error: string | null;
  pending: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const r = chestRarity(chest);
  const rewardRarity = rarityOf(loot?.reward_tier ?? null);
  const showingLoot = phase === "reveal" && loot && !error;

  const modal = (
    <div
      className={`chest-overlay chest-overlay-${r}`}
      role="dialog"
      aria-modal="true"
      aria-label="Abrir cofre"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase === "reveal") onClose();
      }}
    >
      <div className="chest-overlay-panel">
        <button
          type="button"
          className="chest-overlay-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ✕
        </button>

        <div className="flex items-start justify-between gap-3 pr-8 text-left">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)]">
              {error
                ? "Error"
                : phase === "reveal"
                  ? "Premio guardado"
                  : "Abriendo"}
            </p>
            <h3 className="truncate font-display text-xl leading-tight text-white">
              {chest.name}
            </h3>
          </div>
          {phase !== "reveal" && !error ? (
            <p className="shrink-0 rounded-full border border-[var(--amber)] px-2.5 py-1 text-xs font-bold text-[var(--amber)]">
              −{chest.price_tokens.toLocaleString("es-ES")} ★
            </p>
          ) : null}
        </div>

        <div className={`chest-stage ${showingLoot ? "has-reward" : ""}`}>
          <ChestArt
            rarity={r}
            size="xl"
            shaking={phase === "shake" || pending}
            open={phase === "open" || phase === "reveal"}
          />
          {showingLoot ? (
            <div className="chest-reward-pop">
              {loot.kind === "tokens" || loot.kind === "duplicate" ? (
                <span className="chest-reward-tokens">★</span>
              ) : (
                <ShopItemArt
                  category={loot.reward_category ?? "frame"}
                  sku={loot.reward_sku ?? ""}
                  rarity={rewardRarity}
                  size="md"
                />
              )}
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-[var(--danger)]">{error}</p>
        ) : showingLoot ? (
          <div className="space-y-1.5 text-center">
            <p className={`shop-rarity-tag ${RARITY_META[rewardRarity].className}`}>
              {loot.kind === "tokens"
                ? "Fichas"
                : loot.kind === "duplicate"
                  ? "Duplicado"
                  : RARITY_META[rewardRarity].label}
            </p>
            <p className="font-display text-2xl leading-tight text-white">
              {loot.label ?? loot.reward_name ?? "Premio"}
            </p>
            {loot.kind === "duplicate" || loot.kind === "tokens" ? (
              <p className="text-sm text-[var(--amber)]">
                +{Number(loot.amount ?? 0).toLocaleString("es-ES")} ★
              </p>
            ) : (
              <p className="text-xs text-[var(--teal)]">
                Equipado en tu perfil · {categoryLabel(loot.reward_category ?? "")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            {phase === "shake" ? "Cobrando fichas…" : "¡Revelando premio!"}
          </p>
        )}

        {phase === "reveal" || error ? (
          <div className="mt-3 grid gap-2">
            <button type="button" className="mega-cta !min-h-12 w-full" onClick={onClose}>
              Listo
            </button>
            {!error && loot && loot.kind !== "tokens" ? (
              <Link
                href="/app/profile"
                className="btn-ghost inline-flex min-h-11 items-center justify-center text-sm"
                onClick={onClose}
              >
                Ver en perfil
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

function ShopGrid({
  title,
  subtitle,
  items,
  ownedMap,
  balance,
  pending,
  emptyHint,
  onPreview,
  onOpenChest,
}: {
  title: string;
  subtitle?: string;
  items: ShopCardItem[];
  ownedMap: Record<string, boolean>;
  balance: number;
  pending: boolean;
  emptyHint?: string;
  onPreview: (id: string) => void;
  onOpenChest: (item: ShopCardItem) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl">{title}</h2>
          {subtitle ? <p className="text-xs text-[var(--muted)]">{subtitle}</p> : null}
        </div>
        <span className="text-xs text-[var(--muted)]">{items.length}</span>
      </div>
      {items.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <ShopProductCard
              key={item.id}
              item={item}
              owned={ownedMap[item.id] != null}
              equipped={ownedMap[item.id] === true}
              balance={balance}
              pending={pending}
              onPreview={() => onPreview(item.id)}
              onOpenChest={() => onOpenChest(item)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          {emptyHint ?? "Sin artículos."}
        </div>
      )}
    </div>
  );
}

function ShopProductCard({
  item,
  owned,
  equipped,
  balance,
  featured,
  pending,
  onPreview,
  onOpenChest,
}: {
  item: ShopCardItem;
  owned: boolean;
  equipped: boolean;
  balance: number;
  featured?: boolean;
  pending: boolean;
  onPreview: () => void;
  onOpenChest: () => void;
}) {
  const isChest = item.category === "chest";
  const rarity = isChest ? chestRarity(item) : rarityOf(item.tier);
  const meta = RARITY_META[rarity];
  const canBuy = !owned && balance >= item.price_tokens;
  const canOpen = isChest && balance >= item.price_tokens;
  const short = balance < item.price_tokens && (!owned || isChest);

  return (
    <article
      className={`shop-card ${meta.className} ${featured ? "shop-card-featured" : ""} ${
        equipped ? "shop-card-equipped" : ""
      }`}
      onMouseEnter={onPreview}
      onFocus={onPreview}
    >
      {featured ? <p className="shop-badge-day">Oferta del día</p> : null}
      {!isChest && owned ? (
        <span className={`shop-owned-badge ${equipped ? "is-equipped" : ""}`}>
          {equipped ? "Equipado" : "Tuyo"}
        </span>
      ) : null}

      <div className="shop-card-row">
        <div className="shop-card-art" aria-hidden>
          <ShopItemArt
            category={item.category}
            sku={item.sku}
            rarity={rarity}
            size={featured || isChest ? "lg" : "md"}
          />
        </div>

        <div className="shop-card-body">
          <div className="flex items-center gap-2">
            <p className={`shop-rarity-tag ${meta.className}`}>{meta.label}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              {categoryLabel(item.category)}
            </p>
          </div>
          <h3 className="shop-card-title">{item.name}</h3>
          <p className="shop-card-desc">
            {item.description ?? "Cosmético · sin ventaja competitiva"}
          </p>
          <div className="shop-card-price-row">
            <p className="shop-card-price">
              {item.price_tokens.toLocaleString("es-ES")}
              <span>★</span>
            </p>
            <p className="shop-stars" aria-label={`${meta.stars} de rareza`}>
              {"★".repeat(meta.stars)}
              <span className="opacity-30">{"★".repeat(5 - meta.stars)}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="shop-card-actions">
        {!isChest ? (
          <button type="button" className="btn-ghost min-h-11 flex-1 text-xs" onClick={onPreview}>
            Probar
          </button>
        ) : null}

        {isChest ? (
          <button
            type="button"
            disabled={!canOpen || pending}
            onClick={onOpenChest}
            className={`min-h-11 w-full text-sm ${canOpen ? "mega-cta !min-h-11" : "btn-ghost opacity-70"}`}
          >
            {canOpen
              ? pending
                ? "Abriendo…"
                : `Abrir · ${item.price_tokens.toLocaleString("es-ES")} ★`
              : "Sin fichas"}
          </button>
        ) : owned ? (
          equipped ? (
            <span className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[var(--teal)] px-4 text-sm font-semibold text-[var(--teal)]">
              En uso
            </span>
          ) : (
            <form action={equipShopItemAction.bind(null, item.id)} className="flex-1">
              <button type="submit" className="btn-primary min-h-11 w-full text-sm">
                Equipar
              </button>
            </form>
          )
        ) : (
          <form action={purchaseShopItemAction.bind(null, item.id)} className="flex-1">
            <button
              type="submit"
              className={`min-h-11 w-full text-sm ${canBuy ? "btn-primary" : "btn-ghost opacity-70"}`}
              disabled={!canBuy}
            >
              {canBuy ? `Comprar · ${item.price_tokens.toLocaleString("es-ES")} ★` : "Sin fichas"}
            </button>
          </form>
        )}
      </div>
      {short ? (
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Te faltan {(item.price_tokens - balance).toLocaleString("es-ES")} ★
        </p>
      ) : null}
    </article>
  );
}
