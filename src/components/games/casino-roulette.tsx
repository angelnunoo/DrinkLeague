"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { spinCasinoRouletteAction } from "@/app/actions";

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const SEG = 360 / WHEEL_ORDER.length;

const CHIPS = [
  { value: 10, tone: "white", label: "10" },
  { value: 50, tone: "blue", label: "50" },
  { value: 100, tone: "green", label: "100" },
  { value: 500, tone: "red", label: "500" },
  { value: 1000, tone: "black", label: "1K" },
] as const;

type ChipValue = (typeof CHIPS)[number]["value"];
type SpotChips = Record<string, ChipValue[]>;

type SpinPayload = {
  number?: number;
  color?: string;
  stake?: number;
  payout?: number;
  tokens?: number;
  result?: string;
  xp?: number;
  bets?: Array<{ spot: string; amount: number; won: boolean; payout: number }>;
};

type RuletaStats = {
  played?: number;
  won?: number;
  lost?: number;
  tokens_won?: number;
  tokens_lost?: number;
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

function playChipSound() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 340;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    o.stop(ctx.currentTime + 0.07);
    window.setTimeout(() => ctx.close(), 100);
  } catch {
    /* optional */
  }
}

function sumChips(chips: ChipValue[]) {
  return chips.reduce((a, c) => a + c, 0);
}

function ChipStack({ chips, flying }: { chips: ChipValue[]; flying?: boolean }) {
  const top = chips.slice(-4);
  if (!top.length) return null;
  const total = sumChips(chips);
  return (
    <div className={`chip-stack ${flying ? "chip-stack-fly" : ""}`}>
      {top.map((v, i) => {
        const tone = CHIPS.find((c) => c.value === v)?.tone ?? "white";
        return (
          <span
            key={`${v}-${i}`}
            className={`casino-chip chip-${tone} chip-mini`}
            style={{ transform: `translateY(${-i * 4}px)` }}
          >
            {v >= 1000 ? "1K" : v}
          </span>
        );
      })}
      <span className="chip-stack-total">{total}</span>
    </div>
  );
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
  const [selectedChip, setSelectedChip] = useState<ChipValue>(100);
  const [spots, setSpots] = useState<SpotChips>({});
  const [spinning, setSpinning] = useState(false);
  const [wheelRot, setWheelRot] = useState(0);
  const [ballRot, setBallRot] = useState(0);
  const [result, setResult] = useState<SpinPayload | null>(null);
  const [phase, setPhase] = useState<"bet" | "spin" | "win" | "lose">("bet");
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [vibeOn, setVibeOn] = useState(true);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);

  const bal = Number(tokenBalance ?? 0);
  const totalStake = useMemo(
    () => Object.values(spots).reduce((a, chips) => a + sumChips(chips), 0),
    [spots],
  );

  const conic = useMemo(
    () =>
      WHEEL_ORDER.map((n, i) => {
        const start = (i / WHEEL_ORDER.length) * 100;
        const end = ((i + 1) / WHEEL_ORDER.length) * 100;
        const c = pocketColor(n);
        const hex = c === "green" ? "#0d9f6e" : c === "red" ? "#c41e3a" : "#141414";
        return `${hex} ${start}% ${end}%`;
      }).join(", "),
    [],
  );

  function placeOnSpot(spot: string, value: ChipValue = selectedChip) {
    if (spinning || pending || phase === "spin") return;
    if (totalStake + value > bal) {
      setError("💰 No tienes fichas suficientes.");
      return;
    }
    setError(null);
    setSpots((prev) => ({
      ...prev,
      [spot]: [...(prev[spot] ?? []), value],
    }));
    if (soundOn) playChipSound();
    if (vibeOn) vibrate(12);
  }

  function clearBets() {
    if (spinning || pending) return;
    setSpots({});
    setError(null);
  }

  function undoLast() {
    if (spinning || pending) return;
    setSpots((prev) => {
      const keys = Object.keys(prev);
      if (!keys.length) return prev;
      const last = keys[keys.length - 1];
      const arr = [...(prev[last] ?? [])];
      arr.pop();
      const next = { ...prev };
      if (arr.length) next[last] = arr;
      else delete next[last];
      return next;
    });
  }

  function stopTicks() {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function spin() {
    if (spinning || pending) return;
    const bets = Object.entries(spots)
      .map(([spot, chips]) => ({ spot, amount: sumChips(chips) }))
      .filter((b) => b.amount > 0);
    if (!bets.length) {
      setError("Coloca al menos una ficha en la mesa.");
      return;
    }
    if (totalStake > bal) {
      setError("💰 No tienes fichas suficientes para jugar.");
      return;
    }

    setError(null);
    setResult(null);
    setSpinning(true);
    setPhase("spin");

    startTransition(async () => {
      try {
        const r = await spinCasinoRouletteAction(bets);
        if (r?.error) {
          setError(r.error);
          setSpinning(false);
          setPhase("bet");
          return;
        }
        const payload = (r?.payload ?? {}) as SpinPayload;
        const n = Number(payload.number ?? 0);
        const idx = WHEEL_ORDER.findIndex((x) => x === n);
        const pocketAngle = (idx >= 0 ? idx : 0) * SEG + SEG / 2;
        setWheelRot((w) => w + 360 * 6 + (360 - pocketAngle));
        setBallRot((b) => b - 360 * 8 - pocketAngle);

        if (vibeOn) vibrate(20);
        if (soundOn) {
          stopTicks();
          let f = 380;
          tickRef.current = window.setInterval(() => {
            playChipSound();
            f = Math.max(180, f - 10);
            void f;
          }, 95);
        }

        window.setTimeout(() => {
          stopTicks();
          setResult(payload);
          setSpinning(false);
          const won = payload.result === "win";
          setPhase(won ? "win" : "lose");
          if (vibeOn) vibrate(won ? [40, 40, 100] : 70);
          if (!won) {
            window.setTimeout(() => setSpots({}), 700);
          }
          router.refresh();
        }, 5200);
      } catch {
        stopTicks();
        setError("No se pudo girar.");
        setSpinning(false);
        setPhase("bet");
      }
    });
  }

  function playAgain() {
    setResult(null);
    setSpots({});
    setPhase("bet");
    setError(null);
  }

  function onDragStart(e: React.DragEvent, value: ChipValue) {
    e.dataTransfer.setData("text/chip", String(value));
    e.dataTransfer.effectAllowed = "copy";
  }

  function onDropSpot(e: React.DragEvent, spot: string) {
    e.preventDefault();
    setDragOver(null);
    const raw = e.dataTransfer.getData("text/chip");
    const value = Number(raw) as ChipValue;
    if (CHIPS.some((c) => c.value === value)) placeOnSpot(spot, value);
  }

  function spotHandlers(spot: string) {
    return {
      onClick: () => placeOnSpot(spot),
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(spot);
      },
      onDragLeave: () => setDragOver(null),
      onDrop: (e: React.DragEvent) => onDropSpot(e, spot),
    };
  }

  function spotClass(spot: string, extra = "") {
    return [
      "table-spot",
      dragOver === spot ? "table-spot-hot" : "",
      phase === "lose" && spots[spot] ? "table-spot-lose" : "",
      phase === "win" && spots[spot] ? "table-spot-win" : "",
      extra,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const net = Number(result?.tokens ?? 0);
  const colorEmoji =
    result?.color === "red" ? "🔴" : result?.color === "black" ? "⚫" : "🟢";

  return (
    <div className="game-card game-card-ruleta-casino euro-roulette casino-table-wrap space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        DrinkCasino · Mesa europea
      </p>
      <h2 className="font-display text-3xl text-[var(--ink-strong)]">Ruleta Casino</h2>
      <p className="text-sm text-[var(--muted)]">
        Elige ficha · toca o arrastra a la mesa · {bal.toLocaleString("es-ES")} ★
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
              style={{ transform: `rotate(${i * SEG + SEG / 2}deg)` }}
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

      {phase === "bet" || phase === "spin" ? (
        <>
          <div className="chip-tray">
            <p className="mb-2 text-center text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Fichas
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {CHIPS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  draggable={!spinning}
                  onDragStart={(e) => onDragStart(e, c.value)}
                  onClick={() => setSelectedChip(c.value)}
                  className={`casino-chip chip-${c.tone} ${
                    selectedChip === c.value ? "chip-selected" : ""
                  }`}
                  aria-label={`Ficha ${c.value}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-[var(--amber)]">
              Apuesta en mesa · {totalStake.toLocaleString("es-ES")} ★
            </p>
          </div>

          <div className="roulette-felt">
            <button type="button" {...spotHandlers("n0")} className={spotClass("n0", "spot-zero")}>
              <span>0</span>
              {spots.n0 ? <ChipStack chips={spots.n0} /> : null}
            </button>

            <div className="felt-numbers">
              {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => {
                const spot = `n${n}`;
                const color = pocketColor(n);
                return (
                  <button
                    key={n}
                    type="button"
                    {...spotHandlers(spot)}
                    className={spotClass(spot, `spot-num spot-${color}`)}
                  >
                    <span>{n}</span>
                    {spots[spot] ? <ChipStack chips={spots[spot]} /> : null}
                  </button>
                );
              })}
            </div>

            <div className="felt-outside">
              {(
                [
                  ["red", "Rojo"],
                  ["black", "Negro"],
                  ["even", "Par"],
                  ["odd", "Impar"],
                  ["low", "1-18"],
                  ["high", "19-36"],
                ] as const
              ).map(([spot, label]) => (
                <button
                  key={spot}
                  type="button"
                  {...spotHandlers(spot)}
                  className={spotClass(spot, `spot-out spot-out-${spot}`)}
                >
                  <span>{label}</span>
                  {spots[spot] ? <ChipStack chips={spots[spot]} /> : null}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={spinning || pending || !totalStake}
              onClick={undoLast}
              className="btn-ghost min-h-12 text-xs"
            >
              Deshacer
            </button>
            <button
              type="button"
              disabled={spinning || pending || !totalStake}
              onClick={clearBets}
              className="btn-ghost min-h-12 text-xs"
            >
              Limpiar
            </button>
            <button
              type="button"
              disabled={spinning || pending || !totalStake}
              onClick={spin}
              className="mega-cta !min-h-12 !text-sm"
            >
              {spinning || pending ? "…" : "Girar"}
            </button>
          </div>
        </>
      ) : null}

      {result && (phase === "win" || phase === "lose") ? (
        <div
          className={`roulette-result roulette-result-fullscreen ${
            phase === "win" ? "bj-result-win" : "bj-result-lose"
          }`}
        >
          <div className="roulette-confetti" aria-hidden />
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
            Resultado
          </p>
          <p className="mt-2 font-display text-5xl">
            {colorEmoji} {result.number}
          </p>
          <h3 className="mt-2 font-display text-3xl">
            {phase === "win" ? "Has ganado" : "Has perdido"}
          </h3>
          <p className="mt-2 font-display text-2xl text-[var(--amber)]">
            {net >= 0 ? `+${net.toLocaleString("es-ES")}` : net.toLocaleString("es-ES")} fichas
          </p>
          <p className="text-xs text-[var(--muted)]">
            Apostado {Number(result.stake ?? 0).toLocaleString("es-ES")} ★ · +{result.xp ?? 0} XP
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={playAgain} className="mega-cta !min-h-14 !text-base">
              Volver a jugar
            </button>
            <button
              type="button"
              onClick={() => router.push("/app/casino")}
              className="btn-primary min-h-14 text-base"
            >
              Salir
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="stat-chip p-2 text-center">
          <p className="text-[9px] text-[var(--muted)]">Jugadas</p>
          <p className="font-display text-lg">{stats?.played ?? 0}</p>
        </div>
        <div className="stat-chip p-2 text-center">
          <p className="text-[9px] text-[var(--muted)]">G/P</p>
          <p className="font-display text-lg">
            <span className="text-[var(--teal)]">{stats?.won ?? 0}</span>/
            <span className="text-[var(--danger)]">{stats?.lost ?? 0}</span>
          </p>
        </div>
        <div className="stat-chip p-2 text-center">
          <p className="text-[9px] text-[var(--muted)]">Neto</p>
          <p className="font-display text-lg">
            {(Number(stats?.tokens_won ?? 0) - Number(stats?.tokens_lost ?? 0)).toLocaleString(
              "es-ES",
            )}
          </p>
        </div>
        <div className="stat-chip p-2 text-center">
          <p className="text-[9px] text-[var(--muted)]">Favorito</p>
          <p className="font-display text-lg">
            {stats?.favorite_number != null ? stats.favorite_number : "-"}
          </p>
        </div>
      </div>
    </div>
  );
}
