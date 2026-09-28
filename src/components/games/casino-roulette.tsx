"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { spinCasinoRouletteAction } from "@/app/actions";

/** Standard European wheel order (clockwise). */
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const STAKES = [50, 100, 250, 500, 1000] as const;
const SEG = 360 / WHEEL_ORDER.length;

type OutsideBet = "red" | "black" | "even" | "odd" | "low" | "high";
type BetKind = OutsideBet | "number";

type SpinPayload = {
  number?: number;
  color?: string;
  bet?: string;
  bet_number?: number | null;
  stake?: number;
  payout?: number;
  tokens?: number;
  result?: string;
  xp?: number;
  mult?: number;
};

type RuletaStats = {
  played?: number;
  won?: number;
  lost?: number;
  best_streak?: number;
  tokens_won?: number;
  tokens_lost?: number;
  biggest_win?: number;
  favorite_number?: number | null;
};

function pocketColor(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return RED.has(n) ? "red" : "black";
}

function vibrate(pattern: number | number[] = 40) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

function playCasinoTick(freq = 420) {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.value = 0.03;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    o.stop(ctx.currentTime + 0.06);
    window.setTimeout(() => ctx.close(), 100);
  } catch {
    /* optional */
  }
}

function betLabel(kind: BetKind, num: number | null): string {
  if (kind === "number") return `🎯 ${num ?? 0}`;
  const map: Record<OutsideBet, string> = {
    red: "🔴 Rojo",
    black: "⚫ Negro",
    even: "⚪ Par",
    odd: "⚪ Impar",
    low: "⬇️ 1-18",
    high: "⬆️ 19-36",
  };
  return map[kind];
}

export function CasinoRoulette({
  tokenBalance,
  stats,
}: {
  tokenBalance: number;
  stats?: RuletaStats | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stake, setStake] = useState(100);
  const [customStake, setCustomStake] = useState("");
  const [betKind, setBetKind] = useState<BetKind>("red");
  const [pickNumber, setPickNumber] = useState<number | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [wheelRot, setWheelRot] = useState(0);
  const [ballRot, setBallRot] = useState(0);
  const [result, setResult] = useState<SpinPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [vibeOn, setVibeOn] = useState(true);
  const [flash, setFlash] = useState(false);
  const tickRef = useRef<number | null>(null);

  const bal = Number(tokenBalance ?? 0);
  const effectiveStake = customStake.trim()
    ? Math.min(10000, Math.max(50, Number(customStake) || 0))
    : stake;

  const conic = useMemo(() => {
    return WHEEL_ORDER.map((n, i) => {
      const start = (i / WHEEL_ORDER.length) * 100;
      const end = ((i + 1) / WHEEL_ORDER.length) * 100;
      const c = pocketColor(n);
      const hex = c === "green" ? "#0d9f6e" : c === "red" ? "#c41e3a" : "#141414";
      return `${hex} ${start}% ${end}%`;
    }).join(", ");
  }, []);

  function resolveBetPayload(): string | null {
    if (betKind === "number") {
      if (pickNumber == null) return null;
      return `n${pickNumber}`;
    }
    return betKind;
  }

  function stopTicks() {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function spin() {
    if (spinning || pending) return;
    const bet = resolveBetPayload();
    if (!bet) {
      setError("Elige un número concreto.");
      setShowNumbers(true);
      return;
    }
    if (effectiveStake < 50 || effectiveStake > 10000) {
      setError("Apuesta entre 50 y 10.000 ★");
      return;
    }
    if (effectiveStake > bal) {
      setError("💰 No tienes fichas suficientes para jugar.");
      return;
    }

    setError(null);
    setResult(null);
    setSpinning(true);
    setFlash(false);

    startTransition(async () => {
      try {
        const r = await spinCasinoRouletteAction(effectiveStake, bet);
        if (r?.error) {
          setError(r.error);
          setSpinning(false);
          return;
        }
        const payload = (r?.payload ?? {}) as SpinPayload;
        const n = Number(payload.number ?? 0);
        const idx = WHEEL_ORDER.findIndex((x) => x === n);
        const pocketAngle = (idx >= 0 ? idx : 0) * SEG + SEG / 2;

        // Wheel spins clockwise many turns; ball opposite then lands on pocket under pointer (top).
        const wheelTarget = wheelRot + 360 * 6 + (360 - pocketAngle);
        const ballTarget = ballRot - 360 * 8 - pocketAngle;

        setWheelRot(wheelTarget);
        setBallRot(ballTarget);

        if (vibeOn) vibrate(20);
        if (soundOn) {
          stopTicks();
          let f = 380;
          tickRef.current = window.setInterval(() => {
            playCasinoTick(f);
            f = Math.max(180, f - 8);
          }, 90);
        }

        window.setTimeout(() => {
          stopTicks();
          setResult(payload);
          setSpinning(false);
          setFlash(true);
          if (soundOn) playCasinoTick(payload.result === "win" ? 660 : 220);
          if (vibeOn) vibrate(payload.result === "win" ? [40, 40, 100] : 70);
          router.refresh();
          window.setTimeout(() => setFlash(false), 1600);
        }, 5200);
      } catch {
        stopTicks();
        setError("No se pudo girar.");
        setSpinning(false);
      }
    });
  }

  const net = Number(result?.tokens ?? 0);
  const colorEmoji =
    result?.color === "red" ? "🔴" : result?.color === "black" ? "⚫" : "🟢";

  const played = Number(stats?.played ?? 0);
  const won = Number(stats?.won ?? 0);
  const lost = Number(stats?.lost ?? 0);
  const tw = Number(stats?.tokens_won ?? 0);
  const tl = Number(stats?.tokens_lost ?? 0);

  return (
    <div className={`game-card game-card-ruleta-casino euro-roulette space-y-4 ${flash ? "euro-flash" : ""}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        DrinkCasino · Europea
      </p>
      <h2 className="font-display text-3xl text-[var(--ink-strong)]">Ruleta Casino</h2>
      <p className="text-sm text-[var(--muted)]">
        0–36 · Rojo/Negro ×2 · Número ×35 · {bal.toLocaleString("es-ES")} ★
      </p>

      <div className="flex justify-center gap-2">
        <button
          type="button"
          className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
            soundOn ? "border-[var(--amber)] text-[var(--amber)]" : "border-[var(--line)]"
          }`}
          onClick={() => setSoundOn((v) => !v)}
        >
          🔊 {soundOn ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
            vibeOn ? "border-[var(--teal)] text-[var(--teal)]" : "border-[var(--line)]"
          }`}
          onClick={() => setVibeOn((v) => !v)}
        >
          📳 {vibeOn ? "ON" : "OFF"}
        </button>
      </div>

      {/* Wheel */}
      <div className="euro-stage">
        <div className="euro-lights" aria-hidden />
        <div className="euro-pointer" aria-hidden />
        <div
          className="euro-wheel"
          style={{
            background: `conic-gradient(from -90deg, ${conic})`,
            transform: `rotate(${wheelRot}deg)`,
            transition: spinning
              ? "transform 5.2s cubic-bezier(0.08, 0.72, 0.05, 1)"
              : "none",
          }}
        >
          {WHEEL_ORDER.map((n, i) => (
            <span
              key={n}
              className="euro-label"
              style={{
                transform: `rotate(${i * SEG + SEG / 2}deg)`,
              }}
            >
              {n}
            </span>
          ))}
        </div>
        <div
          className="euro-ball-track"
          style={{
            transform: `rotate(${ballRot}deg)`,
            transition: spinning
              ? "transform 5.2s cubic-bezier(0.05, 0.55, 0.08, 1)"
              : "none",
          }}
        >
          <span className="euro-ball" aria-hidden />
        </div>
        <div className="euro-hub font-display">★</div>
      </div>

      {!result ? (
        <>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Fichas · {effectiveStake.toLocaleString("es-ES")} ★
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {STAKES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStake(s);
                    setCustomStake("");
                  }}
                  className={`min-h-12 rounded-xl text-xs font-bold ${
                    !customStake && stake === s
                      ? "bg-[var(--amber)] text-[#0b1512]"
                      : "border border-[var(--line)]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <input
              className="input min-h-12"
              inputMode="numeric"
              placeholder="Cantidad personalizada (50–10000)"
              value={customStake}
              onChange={(e) => setCustomStake(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Apuesta rápida · {betLabel(betKind, pickNumber)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["red", "🔴 Rojo ×2"],
                  ["black", "⚫ Negro ×2"],
                  ["even", "⚪ Par ×2"],
                  ["odd", "⚪ Impar ×2"],
                  ["low", "⬇️ 1-18 ×2"],
                  ["high", "⬆️ 19-36 ×2"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setBetKind(k);
                    setShowNumbers(false);
                  }}
                  className={`min-h-14 rounded-2xl text-sm font-bold ${
                    betKind === k && !showNumbers
                      ? k === "red"
                        ? "bg-[var(--danger)] text-white"
                        : k === "black"
                          ? "bg-[#1a1a1a] text-white border border-[var(--line)]"
                          : "bg-[var(--ink)] text-[#0b1512]"
                      : "border border-[var(--line)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setBetKind("number");
                setShowNumbers(true);
              }}
              className={`min-h-14 w-full rounded-2xl text-sm font-bold ${
                betKind === "number"
                  ? "bg-[var(--teal)] text-[#0b1512]"
                  : "border border-[var(--line)]"
              }`}
            >
              🎯 Número concreto ×35
              {pickNumber != null ? ` · ${pickNumber}` : ""}
            </button>
          </div>

          {showNumbers || betKind === "number" ? (
            <div className="euro-number-grid">
              <button
                type="button"
                className={`euro-num euro-num-0 ${pickNumber === 0 ? "euro-num-active" : ""}`}
                onClick={() => {
                  setPickNumber(0);
                  setBetKind("number");
                }}
              >
                0
              </button>
              {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`euro-num ${pocketColor(n) === "red" ? "euro-num-red" : "euro-num-black"} ${
                    pickNumber === n ? "euro-num-active" : ""
                  }`}
                  onClick={() => {
                    setPickNumber(n);
                    setBetKind("number");
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : null}

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

          <button
            type="button"
            disabled={spinning || pending}
            onClick={spin}
            className="mega-cta !min-h-14 w-full !text-base"
          >
            {spinning || pending ? "Girando…" : `🎡 Girar · ${effectiveStake.toLocaleString("es-ES")} ★`}
          </button>
        </>
      ) : (
        <div
          className={`roulette-result roulette-result-fullscreen ${
            result.result === "win" ? "bj-result-win" : "bj-result-lose"
          }`}
        >
          <div className="roulette-confetti" aria-hidden />
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
            🎡 Resultado
          </p>
          <p className="mt-2 font-display text-5xl">
            {colorEmoji} {result.number}
          </p>
          <h3 className="mt-2 font-display text-3xl">
            {result.result === "win" ? "🏆 Has ganado" : "❌ Has perdido"}
          </h3>
          <p className="mt-2 font-display text-2xl text-[var(--amber)]">
            {net >= 0 ? `+${net.toLocaleString("es-ES")}` : net.toLocaleString("es-ES")} fichas
          </p>
          <p className="text-xs text-[var(--muted)]">
            Apuesta · {betLabel(
              String(result.bet ?? "").startsWith("n")
                ? "number"
                : ((result.bet as OutsideBet) ?? "red"),
              result.bet_number ??
                (String(result.bet ?? "").startsWith("n")
                  ? Number(String(result.bet).slice(1))
                  : null),
            )}{" "}
            · +{result.xp ?? 0} XP
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={spinning || pending}
              onClick={() => setResult(null)}
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="stat-chip p-2 text-center">
          <p className="text-[9px] text-[var(--muted)]">Jugadas</p>
          <p className="font-display text-lg">{played}</p>
        </div>
        <div className="stat-chip p-2 text-center">
          <p className="text-[9px] text-[var(--muted)]">G/P</p>
          <p className="font-display text-lg">
            <span className="text-[var(--teal)]">{won}</span>/
            <span className="text-[var(--danger)]">{lost}</span>
          </p>
        </div>
        <div className="stat-chip p-2 text-center">
          <p className="text-[9px] text-[var(--muted)]">Neto</p>
          <p className="font-display text-lg">{(tw - tl).toLocaleString("es-ES")}</p>
        </div>
        <div className="stat-chip p-2 text-center">
          <p className="text-[9px] text-[var(--muted)]">Favorito</p>
          <p className="font-display text-lg">
            {stats?.favorite_number != null ? stats.favorite_number : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
