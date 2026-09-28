import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data";
import { PremiumShop, type ShopCardItem } from "@/components/premium-shop";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ bought?: string; equipped?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("shop_items")
    .select("id, sku, name, description, category, tier, price_tokens")
    .eq("is_active", true)
    .order("price_tokens", { ascending: true });

  const { data: owned } = await supabase
    .from("user_inventory")
    .select("item_id, equipped")
    .eq("user_id", profile.id);

  const ownedMap: Record<string, boolean> = {};
  for (const o of owned ?? []) ownedMap[o.item_id] = o.equipped === true;
  const balance = Number(profile.token_balance ?? 0);

  return (
    <section className="animate-rise space-y-6">
      <div className="shop-hero overflow-hidden rounded-3xl border border-[var(--line)] p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--gold)]">
          Cosméticos premium
        </p>
        <h1 className="font-display text-4xl">Tienda</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Marcos · banners · cofres · exclusivos · sin pay-to-win
        </p>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase text-[var(--muted)]">Tu saldo</p>
            <p className="font-display text-3xl text-[var(--amber)]">
              {balance.toLocaleString("es-ES")} ★
            </p>
          </div>
          <Link href="/app/casino" className="btn-ghost min-h-11 text-xs">
            🎰 Ganar fichas
          </Link>
        </div>
      </div>

      {sp.bought ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          ✨ Compra realizada. ¡Luce espectacular!
        </p>
      ) : null}
      {sp.equipped ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--amber)_15%,transparent)] px-3 py-2 text-sm">
          Cosmético equipado en tu perfil.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="shop-pill shop-rarity-common">⚪ Común</span>
        <span className="shop-pill shop-rarity-rare">🔵 Raro</span>
        <span className="shop-pill shop-rarity-epic">🟣 Épico</span>
        <span className="shop-pill shop-rarity-legendary">🟡 Legendario</span>
        <span className="shop-pill shop-rarity-mythic">💎 Mítico</span>
      </div>

      <PremiumShop
        items={(items ?? []) as ShopCardItem[]}
        ownedMap={ownedMap}
        balance={balance}
        displayName={profile.display_name}
        currentTitle={profile.title ?? "Novato"}
      />

      <div className="surface space-y-2 p-4 text-sm text-[var(--muted)]">
        <p className="font-display text-lg text-[var(--ink)]">Ofertas</p>
        <p>🔥 Oferta del Día · rotación diaria automática</p>
        <p>⚡ Fin de semana · mira los cofres épicos</p>
        <p>👑 Exclusivos temporada · Fundador / Casino / Campeones</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/app/casino" className="surface min-h-14 p-4 text-center font-display text-lg">
          DrinkCasino
        </Link>
        <Link href="/app/profile" className="surface min-h-14 p-4 text-center font-display text-lg">
          Mi perfil
        </Link>
      </div>
    </section>
  );
}
