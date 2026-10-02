import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data";
import { PremiumShop, type ShopCardItem } from "@/components/premium-shop";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ bought?: string; equipped?: string; error?: string }>;
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
  const ownedCount = Object.keys(ownedMap).length;
  const catalogCount = (items ?? []).length;

  return (
    <section className="animate-rise space-y-6 pb-4">
      <div className="shop-hero overflow-hidden rounded-3xl border border-[var(--line)] p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--amber)]">
          Cosméticos · Sin pay-to-win
        </p>
        <h1 className="font-display text-4xl text-[var(--ink-strong)]">Tienda</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Marcos · banners · cofres · exclusivos
        </p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase text-[var(--muted)]">Tu saldo</p>
            <p className="font-display text-4xl text-[var(--amber)]">
              {balance.toLocaleString("es-ES")} ★
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-[var(--muted)]">Inventario</p>
            <p className="font-display text-2xl">
              {ownedCount}
              <span className="text-sm text-[var(--muted)]">/{catalogCount}</span>
            </p>
          </div>
        </div>
        <Link href="/app/casino" className="mega-cta mt-4 !min-h-12 !text-base">
          Ganar fichas en DrinkCasino
        </Link>
      </div>

      {sp.bought ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-4 py-3 text-sm text-[var(--teal)] animate-pop">
          Compra realizada. ¡Luce espectacular!
        </p>
      ) : null}
      {sp.equipped ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--amber)_15%,transparent)] px-4 py-3 text-sm animate-pop">
          Cosmético equipado en tu perfil.
        </p>
      ) : null}
      {sp.error ? (
        <p className="rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["common", "Común"],
            ["rare", "Raro"],
            ["epic", "Épico"],
            ["legendary", "Legendario"],
            ["mythic", "Mítico"],
          ] as const
        ).map(([key, label]) => (
          <span key={key} className={`shop-pill shop-rarity-${key}`}>
            {label}
          </span>
        ))}
      </div>

      <PremiumShop
        items={(items ?? []) as ShopCardItem[]}
        ownedMap={ownedMap}
        balance={balance}
        displayName={profile.display_name}
        currentTitle={profile.title ?? "Novato"}
      />

      <div className="premium-banner space-y-2 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
          Rotación
        </p>
        <p className="font-display text-xl">Ofertas y exclusivos</p>
        <ul className="space-y-1 text-sm text-[var(--muted)]">
          <li>Oferta del día · rota automáticamente cada 24 h</li>
          <li>Cofres épicos · mayor rareza, mejor botín</li>
          <li>Exclusivos de temporada · Fundador · Casino · Campeones</li>
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/app/casino"
          className="surface flex min-h-16 flex-col items-center justify-center p-4 text-center transition active:scale-[0.98]"
        >
          <p className="font-display text-lg">DrinkCasino</p>
          <p className="text-[10px] text-[var(--muted)]">Gana fichas</p>
        </Link>
        <Link
          href="/app/profile"
          className="surface flex min-h-16 flex-col items-center justify-center p-4 text-center transition active:scale-[0.98]"
        >
          <p className="font-display text-lg">Mi perfil</p>
          <p className="text-[10px] text-[var(--muted)]">Equipar look</p>
        </Link>
      </div>
    </section>
  );
}
