import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data";
import { purchaseShopItemAction, equipShopItemAction } from "@/app/actions";
import type { ShopItem } from "@/lib/types";

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
    .select("*")
    .eq("is_active", true)
    .order("price_tokens", { ascending: true });

  const { data: owned } = await supabase
    .from("user_inventory")
    .select("item_id, equipped")
    .eq("user_id", profile.id);

  const ownedMap = new Map((owned ?? []).map((o) => [o.item_id, o.equipped]));
  const balance = Number(profile.token_balance ?? 0);

  return (
    <section className="animate-rise space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Cosméticos</p>
          <h1 className="font-display text-3xl">Tienda</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Solo estética. Sin pay-to-win.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--muted)]">Tu saldo</p>
          <p className="font-display text-2xl text-[var(--amber)]">
            {balance.toLocaleString("es-ES")} ★
          </p>
        </div>
      </div>

      {sp.bought ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          Compra realizada.
        </p>
      ) : null}
      {sp.equipped ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--amber)_15%,transparent)] px-3 py-2 text-sm">
          Cosmético equipado.
        </p>
      ) : null}

      <div className="space-y-3">
        {(items as ShopItem[] | null)?.map((item) => {
          const have = ownedMap.has(item.id);
          const equipped = ownedMap.get(item.id) === true;
          const canBuy = !have && balance >= item.price_tokens;
          return (
            <article key={item.id} className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  {item.category} · {item.tier ?? "tier"}
                </p>
                <h2 className="font-display text-xl">{item.name}</h2>
                {item.description ? (
                  <p className="text-sm text-[var(--muted)]">{item.description}</p>
                ) : null}
                <p className="mt-1 font-semibold text-[var(--amber)]">
                  {item.price_tokens.toLocaleString("es-ES")} ★
                </p>
              </div>
              <div className="flex gap-2">
                {have ? (
                  equipped ? (
                    <span className="rounded-full border border-[var(--teal)] px-4 py-2 text-sm text-[var(--teal)]">
                      Equipado
                    </span>
                  ) : (
                    <form action={equipShopItemAction.bind(null, item.id)}>
                      <button type="submit" className="btn-ghost text-sm">
                        Equipar
                      </button>
                    </form>
                  )
                ) : (
                  <form action={purchaseShopItemAction.bind(null, item.id)}>
                    <button type="submit" className="btn-primary text-sm" disabled={!canBuy}>
                      {canBuy ? "Comprar" : "Sin fichas"}
                    </button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <Link href="/app" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
        ← Volver
      </Link>
    </section>
  );
}
