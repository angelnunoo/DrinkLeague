"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { playBlackjackAction, startGameAction } from "@/app/actions";
import { PokerPlayingCard, type PokerCard } from "./poker-card";

export type BlackjackState = {
  phase?: string;
  player?: PokerCard[];
  dealer?: PokerCard[];
  player_total?: number;
  dealer_total?: number;
  dealer_shown?: number;
  hide_dealer?: boolean;
  result?: string;
  message?: string;
  xp?: number;
  tokens?: number;
  stake?: number;
  payout?: number;
};

export function BlackjackPlay({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: BlackjackState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const phase = initial.phase ?? "player";
  const finished = phase === "finished" || Boolean(initial.result);
  const hideDealer = initial.hide_dealer !== false && !finished;
  const player = initial.player ?? [];
  const dealer = initial.dealer ?? [];
  const stake = Number(initial.stake ?? 0);
  const playerTotal = initial.player_total ?? 0;
  const dealerTotal = hideDealer
    ? (initial.dealer_shown ?? (dealer[0] ? cardSoftValue(dealer[0]) : 0))
    : (initial.dealer_total ?? 0);

  function run(action: "hit" | "stand") {
    setError(null);
    startTransition(async () => {
      try {
        const r = await playBlackjackAction(sessionId, action);
        if (r?.error) {
          setError(r.error);
          return;
        }
        setAnimKey((k) => k + 1);
        router.refresh();
      } catch {
        setError("No se pudo jugar. Reintenta.");
      }
    });
  }

  function playAgain() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("game_type", "blackjack");
        fd.set("stake", String(stake || 100));
        const r = await startGameAction(fd);
        if (r?.error) {
          setError(r.error);
          return;
        }
        const nextId = (r?.payload as { sessionId?: string } | undefined)?.sessionId;
        if (!nextId) {
          setError("No se pudo abrir la nueva partida.");
          return;
        }
        window.location.assign(`/app/games/play?id=${encodeURIComponent(nextId)}`);
      } catch {
        setError("No se pudo iniciar otra partida.");
      }
    });
  }

  const result = initial.result;
  const winTone =
    result === "blackjack" || result === "win"
      ? "win"
      : result === "push"
        ? "push"
        : result
          ? "lose"
          : null;
  const net = Number(initial.tokens ?? 0);

  return (
    <div className="bj-table space-y-5" key={animKey}>
      {stake > 0 ? (
        <p className="text-center text-xs text-[var(--amber)]">
          Apuesta · {stake.toLocaleString("es-ES")} ★
        </p>
      ) : null}

      <div className="bj-felt">
        <div className="bj-hand">
          <div className="bj-hand-meta">
            <p className="bj-hand-label">Dealer</p>
            <p className={`bj-score ${hideDealer ? "bj-score-dim" : ""}`}>
              {dealerTotal}
              {hideDealer ? "?" : ""}
            </p>
          </div>
          <div className="bj-cards">
            {dealer.map((c, i) => (
              <div
                key={`d-${i}-${c.rank}-${c.suit}`}
                className="bj-card-slot"
                style={{ zIndex: i + 1, marginLeft: i === 0 ? 0 : "-1.35rem" }}
              >
                <PokerPlayingCard
                  card={c}
                  size="md"
                  faceDown={hideDealer && i > 0}
                  dealDelay={80 + i * 140}
                  flip={hideDealer && i > 0 ? false : i > 0 && !hideDealer}
                />
              </div>
            ))}
            {!dealer.length ? <PokerPlayingCard faceDown size="md" /> : null}
          </div>
        </div>

        <div className="bj-vs" aria-hidden>
          <span>VS</span>
        </div>

        <div className="bj-hand">
          <div className="bj-hand-meta">
            <p className="bj-hand-label">Tú</p>
            <p
              className={`bj-score ${
                playerTotal > 21
                  ? "text-[var(--danger)]"
                  : playerTotal === 21
                    ? "text-[var(--amber)]"
                    : ""
              }`}
            >
              {playerTotal}
            </p>
          </div>
          <div className="bj-cards">
            {player.map((c, i) => (
              <div
                key={`p-${i}-${c.rank}-${c.suit}`}
                className="bj-card-slot"
                style={{ zIndex: i + 1, marginLeft: i === 0 ? 0 : "-1.35rem" }}
              >
                <PokerPlayingCard card={c} size="md" dealDelay={40 + i * 120} />
              </div>
            ))}
            {!player.length ? <PokerPlayingCard faceDown size="md" /> : null}
          </div>
        </div>
      </div>

      {finished ? (
        <div className={`bj-result bj-result-${winTone ?? "push"}`}>
          <p className="bj-result-emoji" aria-hidden>
            {result === "blackjack" ? "🃏" : result === "win" ? "✨" : result === "push" ? "🤝" : "💀"}
          </p>
          <h2 className="font-display text-3xl">
            {result === "blackjack"
              ? "¡BLACKJACK!"
              : result === "win"
                ? "¡Victoria!"
                : result === "push"
                  ? "Empate"
                  : "Derrota"}
          </h2>
          <p className="text-sm text-[var(--muted)]">{initial.message ?? ""}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="stat-chip p-3 text-center">
              <p className="text-[10px] text-[var(--muted)]">XP</p>
              <p className="font-display text-2xl">+{initial.xp ?? 0}</p>
            </div>
            <div className="stat-chip p-3 text-center">
              <p className="text-[10px] text-[var(--muted)]">Fichas</p>
              <p
                className={`font-display text-2xl ${
                  net > 0 ? "text-[var(--teal)]" : net < 0 ? "text-[var(--danger)]" : "text-[var(--amber)]"
                }`}
              >
                {net > 0 ? `+${net}` : net}
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-center gap-6 text-center text-sm">
            <div>
              <p className="text-[10px] text-[var(--muted)]">Tú</p>
              <p className="font-display text-xl">{playerTotal}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--muted)]">Dealer</p>
              <p className="font-display text-xl">{initial.dealer_total ?? dealerTotal}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={playAgain}
              className="mega-cta !min-h-14 !text-base"
            >
              {pending ? "…" : "🟢 Jugar otra"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => router.push("/app/casino")}
              className="btn-primary min-h-14 text-base"
            >
              🚪 Salir
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-sm text-[var(--muted)]">
            Llega a 21 sin pasarte. El dealer se planta en 17.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => run("hit")}
              className="btn-primary min-h-14 text-base"
            >
              {pending ? "…" : "Pedir Carta"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run("stand")}
              className="mega-cta !min-h-14 !text-base"
            >
              {pending ? "…" : "Plantarse"}
            </button>
          </div>
        </div>
      )}

      {error ? <p className="text-center text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

function cardSoftValue(card: PokerCard): number {
  if (card.value != null) return card.rank === 1 ? 11 : card.value;
  if (card.rank === 1) return 11;
  if (card.rank >= 10) return 10;
  return card.rank;
}
