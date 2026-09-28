"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { spinCasinoRouletteAction } from "@/app/actions";

const STAKES = [50, 100, 250, 500, 1000] as const;
type Bet = "red" | "black" | "green";

type SpinPayload = {
  number?: number;
  color?: string;
  bet?: string;
  stake?: number;
  payout?: number;
  tokens?: number;
  result?: string;
  xp?: number;
};

function vibrate(pattern: number | number[] = 40) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

export function CasinoRoulette({ tokenBalance }: { tokenBalance: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stake, setStake] = useState(100);
  const [bet, setBet] = useState<Bet>("red");
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<SpinPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bal = Number(tokenBalance ?? 0);

  function spin() {
    if (spinning || pending) return;
    if (stake > bal) {
      setError("💰 No tienes fichas suficientes para jugar.");
      return;
    }
    setError(null);
    setResult(null);
    setSpinning(true);
    startTransition(async () => {
      try {
        const r = await spinCasinoRouletteAction(stake, bet);
        if (r?.error) {
          setError(r.error);
          setSpinning(false);
          return;
        }
        const payload = (r?.payload ?? {}) as SpinPayload;
        const n = Number(payload.number ?? 0);
        const next = rotation + 360 * 6 + (360 - (n / 37) * 360);
        setRotation(next);
        vibrate(25);
        window.setTimeout(() => {
          setResult(payload);
          setSpinning(false);
          vibrate(payload.result === "win" ? [50, 40, 90] : 60);
          router.refresh();
        }, 4500);
      } catch {
        setError("No se pudo girar.");
        setSpinning(false);
      }
    });
  }

  const colorClass =
    result?.color === "red"
      ? "text-[var(--danger)]"
      : result?.color === "black"
        ? "text-[var(--ink)]"
        : "text-[var(--teal)]";

  return (
    <div className="game-card game-card-ruleta-casino space-y-4">
      <p className="absolute right-4 top-4 text-4xl opacity-90" aria-hidden>
        🎰
      </p>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        DrinkCasino · Apuestas
      </p>
      <h2 className="font-display text-3xl text-[var(--ink-strong)]">Ruleta Casino</h2>
      <p className="text-sm text-[var(--muted)]">
        Rojo/Negro ×2 · Verde ×14 · Saldo {bal.toLocaleString("es-ES")} ★
      </p>

      {!result ? (
        <>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Apuesta</p>
            <div className="grid grid-cols-5 gap-1.5">
              {STAKES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStake(s)}
                  className={`min-h-11 rounded-xl text-xs font-bold ${
                    stake === s
                      ? "bg-[var(--amber)] text-[#0b1512]"
                      : "border border-[var(--line)]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["red", "🔴 Rojo"],
                ["black", "⚫ Negro"],
                ["green", "🟢 Verde"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setBet(k)}
                className={`min-h-12 rounded-xl text-xs font-bold ${
                  bet === k
                    ? k === "red"
                      ? "bg-[var(--danger)] text-white"
                      : k === "green"
                        ? "bg-[var(--teal)] text-[#0b1512]"
                        : "bg-[var(--ink)] text-[#0b1512]"
                    : "border border-[var(--line)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div className="roulette-stage roulette-stage-casino">
        <div className="roulette-pointer" aria-hidden />
        <div
          className="roulette-wheel roulette-wheel-casino"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? "transform 4.5s cubic-bezier(0.1, 0.8, 0.05, 1)"
              : "none",
          }}
        />
        <div className="roulette-hub font-display text-lg">★</div>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {!result ? (
        <button
          type="button"
          disabled={spinning || pending}
          onClick={spin}
          className="btn-primary min-h-14 w-full text-base"
        >
          {spinning || pending ? "Girando…" : `Apostar · ${stake} ★`}
        </button>
      ) : (
        <div
          className={`roulette-result ${
            result.result === "win" ? "bj-result-win" : "bj-result-lose"
          }`}
        >
          <p className="text-5xl" aria-hidden>
            {result.result === "win" ? "🏆" : "💀"}
          </p>
          <h3 className="font-display text-3xl">
            {result.result === "win" ? "¡Victoria!" : "Derrota"}
          </h3>
          <p className={`font-display text-4xl ${colorClass}`}>
            {result.number} · {result.color === "red" ? "Rojo" : result.color === "black" ? "Negro" : "Verde"}
          </p>
          <p className="mt-2 text-sm text-[var(--amber)]">
            {(result.tokens ?? 0) > 0
              ? `+${result.tokens} ★`
              : `${result.tokens ?? -Number(result.stake ?? 0)} ★`}{" "}
            · +{result.xp ?? 0} XP
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={spinning || pending}
              onClick={() => {
                setResult(null);
              }}
              className="mega-cta !min-h-14 !text-base"
            >
              🔄 Volver a jugar
            </button>
            <button
              type="button"
              onClick={() => router.push("/app/casino")}
              className="btn-primary min-h-14 text-base"
            >
              🚪 Salir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
