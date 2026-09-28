import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyLeagues } from "@/lib/data";
import {
  ensureWeeklyMarketAction,
  createSuperBoostAction,
  settleBetMarketAction,
} from "@/app/actions";
import { PlaceBetForm } from "@/components/place-bet-form";
import { RankingPodium } from "@/components/ui/podium";

export async function CasinoBetsPanel({
  profileId,
  leagueId: preferredLeague,
  flash,
}: {
  profileId: string;
  leagueId?: string;
  flash?: { placed?: string; boost?: string; settled?: string; error?: string };
}) {
  const leagues = await getMyLeagues();
  const leagueId = preferredLeague || leagues[0]?.id;
  const supabase = await createClient();

  if (leagueId) {
    await supabase.rpc("ensure_league_bet_markets", { p_league_id: leagueId });
  }

  let markets: Array<{
    id: string;
    title: string;
    market_type: string;
    closes_at: string;
    status: string;
    league_id: string;
  }> = [];
  let selections: Array<{
    id: string;
    market_id: string;
    label: string;
    current_odds: number;
    subject_user_id: string | null;
  }> = [];
  let boosts: Array<{
    id: string;
    selection_id: string;
    original_odds: number;
    boosted_odds: number;
    ends_at: string;
  }> = [];
  let bettorRank: Array<{ user_id: string; net: number; staked: number; display_name?: string }> =
    [];

  if (leagueId) {
    const { data: m } = await supabase
      .from("bet_markets")
      .select("id, title, market_type, closes_at, status, league_id")
      .eq("league_id", leagueId)
      .eq("status", "open")
      .order("closes_at", { ascending: true })
      .limit(20);
    markets = m ?? [];

    if (markets.length) {
      const ids = markets.map((x) => x.id);
      const { data: sels } = await supabase
        .from("bet_selections")
        .select("id, market_id, label, current_odds, subject_user_id")
        .in("market_id", ids);
      selections = sels ?? [];

      const selIds = selections.map((s) => s.id);
      if (selIds.length) {
        const { data: b } = await supabase
          .from("super_boosts")
          .select("id, selection_id, original_odds, boosted_odds, ends_at")
          .in("selection_id", selIds)
          .gt("ends_at", new Date().toISOString());
        boosts = b ?? [];
      }
    }

    const { data: rank } = await supabase
      .from("bettor_stats_league")
      .select("user_id, net, staked")
      .eq("league_id", leagueId)
      .order("net", { ascending: false })
      .limit(10);

    if (rank?.length) {
      const uids = rank.map((r) => r.user_id);
      const { data: users } = await supabase.from("users").select("id, display_name").in("id", uids);
      const umap = new Map((users ?? []).map((u) => [u.id, u.display_name]));
      bettorRank = rank.map((r) => ({
        ...r,
        display_name: umap.get(r.user_id) ?? "?",
      }));
    }
  }

  const boostBySel = new Map(boosts.map((b) => [b.selection_id, b]));
  const myLeague = leagues.find((l) => l.id === leagueId);
  const isCaptain = myLeague?.membership_role === "league_admin";
  const boostedSelections = selections.filter((s) => boostBySel.has(s.id));
  const base = "/app/casino?tab=apuestas";

  return (
    <div id="apuestas" className="space-y-4">
      <div className="casino-hero rounded-3xl border border-[var(--line)] p-4">
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--amber)]">DrinkCasino</p>
        <h2 className="font-display text-3xl">💰 Apuestas</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Mercados de liga · campeones, MVP, récords, retos y eventos
        </p>
      </div>

      {flash?.placed ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          Apuesta colocada.
        </p>
      ) : null}
      {flash?.boost ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--amber)_15%,transparent)] px-3 py-2 text-sm">
          SuperAumento activo.
        </p>
      ) : null}
      {flash?.settled ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          Mercado resuelto.
        </p>
      ) : null}
      {flash?.error ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
          {decodeURIComponent(flash.error)}
        </p>
      ) : null}

      {leagues.length === 0 ? (
        <div className="surface p-6 text-center">
          <p className="font-display text-xl">Necesitas una liga</p>
          <Link href="/app/leagues/new" className="btn-primary mt-4 inline-flex">
            Crear liga
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {leagues.map((l) => (
              <Link
                key={l.id}
                href={`${base}&league=${l.id}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  leagueId === l.id
                    ? "bg-[var(--ink)] text-[#0b1512]"
                    : "border border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {l.name}
              </Link>
            ))}
          </div>

          {boostedSelections.length ? (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
                SuperAumentos
              </p>
              {boostedSelections.map((sel) => {
                const boost = boostBySel.get(sel.id)!;
                const market = markets.find((m) => m.id === sel.market_id);
                const pct = (
                  ((Number(boost.boosted_odds) - Number(boost.original_odds)) /
                    Number(boost.original_odds)) *
                  100
                ).toFixed(0);
                return (
                  <div key={sel.id} className="premium-banner p-4">
                    <div className="relative z-[1]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--gold)]">
                        +{pct}% cuota · premium
                      </p>
                      <p className="mt-1 font-display text-2xl">{sel.label}</p>
                      <p className="text-xs text-[var(--muted)]">{market?.title}</p>
                      <p className="mt-2">
                        <span className="text-[var(--muted)] line-through">
                          {Number(boost.original_odds).toFixed(2)}
                        </span>{" "}
                        <span className="font-display text-3xl text-[var(--amber)]">
                          {Number(boost.boosted_odds).toFixed(2)}
                        </span>
                      </p>
                    </div>
                    <div className="relative z-[1] mt-3">
                      <PlaceBetForm selectionId={sel.id} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="premium-banner p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
                SuperAumentos
              </p>
              <p className="mt-1 font-display text-xl">Sin boost activo ahora</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {isCaptain
                  ? "Como capitán puedes lanzar un SuperAumento en cualquier selección."
                  : "Cuando el capitán active uno, brillará aquí arriba."}
              </p>
            </div>
          )}

          {leagueId && markets.length < 10 ? (
            <form action={ensureWeeklyMarketAction.bind(null, leagueId)}>
              <button type="submit" className="btn-ghost w-full text-sm">
                Refrescar mercados ({markets.length}/10+)
              </button>
            </form>
          ) : null}

          {!markets.length ? (
            <div className="surface p-6 text-center">
              <p className="font-display text-xl">Generando mercados…</p>
              {leagueId ? (
                <form action={ensureWeeklyMarketAction.bind(null, leagueId)} className="mt-4">
                  <button type="submit" className="btn-primary">
                    Crear apuestas ahora
                  </button>
                </form>
              ) : null}
            </div>
          ) : (
            markets.map((market) => {
              const sels = selections.filter((s) => s.market_id === market.id);
              return (
                <div key={market.id} className="surface space-y-3 p-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      {market.market_type.replace(/_/g, " ")}
                    </p>
                    <h3 className="font-display text-xl">{market.title}</h3>
                    <p className="text-xs text-[var(--muted)]">
                      Cierra {new Date(market.closes_at).toLocaleString("es-ES")}
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {sels.map((sel) => {
                      const boost = boostBySel.get(sel.id);
                      if (boost) return null;
                      const odds = Number(sel.current_odds);
                      return (
                        <li key={sel.id} className="rank-row p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold">{sel.label}</p>
                              <p className="font-display text-2xl text-[var(--amber)]">
                                {odds.toFixed(2)}
                              </p>
                            </div>
                            {isCaptain && market.status === "open" ? (
                              <div className="flex flex-col gap-1">
                                <form action={createSuperBoostAction.bind(null, sel.id)}>
                                  <button
                                    type="submit"
                                    className="rounded-full border border-[var(--gold)] px-3 py-1 text-[10px] font-bold text-[var(--gold)]"
                                  >
                                    SuperAumento
                                  </button>
                                </form>
                                <form action={settleBetMarketAction}>
                                  <input type="hidden" name="market_id" value={market.id} />
                                  <input type="hidden" name="winning_selection_id" value={sel.id} />
                                  <input type="hidden" name="league_id" value={leagueId ?? ""} />
                                  <button
                                    type="submit"
                                    className="rounded-full border border-[var(--line)] px-3 py-1 text-[10px] font-bold text-[var(--muted)]"
                                  >
                                    Resolver
                                  </button>
                                </form>
                              </div>
                            ) : null}
                          </div>
                          {market.status === "open" ? (
                            <PlaceBetForm selectionId={sel.id} />
                          ) : (
                            <p className="mt-2 text-xs text-[var(--muted)]">Mercado resuelto</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}

          {bettorRank.length > 0 ? (
            <div className="surface p-4">
              <h3 className="font-display text-2xl">Ranking apostadores</h3>
              <div className="mt-3">
                <RankingPodium
                  meId={profileId}
                  rows={bettorRank.map((r) => ({
                    user_id: r.user_id,
                    display_name: r.display_name ?? "?",
                    points: Math.round(Number(r.net)),
                  }))}
                />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
