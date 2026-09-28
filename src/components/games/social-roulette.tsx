"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { spinSocialRouletteAction } from "@/app/actions";

const SEGMENTS = [
  { key: "cerveza", label: "🍺 Cerveza", color: "#c4a35a" },
  { key: "chupito", label: "🥃 Chupito", color: "#7c5cff" },
  { key: "copa", label: "🍸 Copa", color: "#2dd4bf" },
  { key: "cerveza_x2", label: "🍺×2", color: "#e8b84a" },
  { key: "chupito_x2", label: "🥃×2", color: "#a78bfa" },
  { key: "te_salvas", label: "😇 Salvas", color: "#34d399" },
  { key: "elige_jugador", label: "🤝 Elige", color: "#60a5fa" },
  { key: "todos_beben", label: "🔥 Todos", color: "#f87171" },
  { key: "duelo_rapido", label: "⚔️ Duelo", color: "#fb923c" },
  { key: "rey_bebe", label: "👑 Rey", color: "#fbbf24" },
] as const;

type SpinResult = {
  result?: string;
  label?: string;
  index?: number;
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

function playTick() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 520;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    o.stop(ctx.currentTime + 0.09);
    window.setTimeout(() => ctx.close(), 120);
  } catch {
    /* optional sound */
  }
}

export function SocialRoulette() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [vibeOn, setVibeOn] = useState(true);
  const wheelRef = useRef<HTMLDivElement>(null);

  function spin() {
    if (spinning || pending) return;
    setError(null);
    setResult(null);
    setSpinning(true);
    startTransition(async () => {
      try {
        const r = await spinSocialRouletteAction();
        if (r?.error) {
          setError(r.error);
          setSpinning(false);
          return;
        }
        const payload = (r?.payload ?? {}) as SpinResult;
        const idx =
          typeof payload.index === "number"
            ? payload.index
            : Math.max(
                0,
                SEGMENTS.findIndex((s) => s.key === payload.result),
              );
        const seg = 360 / SEGMENTS.length;
        const target = 360 * 5 + (360 - (idx * seg + seg / 2));
        const next = rotation + target;
        setRotation(next);
        if (soundOn) playTick();
        if (vibeOn) vibrate(30);

        window.setTimeout(() => {
          setResult(payload);
          setSpinning(false);
          if (soundOn) playTick();
          if (vibeOn) vibrate([40, 30, 80]);
          router.refresh();
        }, 4200);
      } catch {
        setError("No se pudo girar.");
        setSpinning(false);
      }
    });
  }

  const conic = SEGMENTS.map((s, i) => {
    const start = (i / SEGMENTS.length) * 100;
    const end = ((i + 1) / SEGMENTS.length) * 100;
    return `${s.color} ${start}% ${end}%`;
  }).join(", ");

  return (
    <div className="game-card game-card-ruleta-social space-y-4">
      <p className="absolute right-4 top-4 text-4xl opacity-90" aria-hidden>
        🎡
      </p>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        Social · Sin fichas
      </p>
      <h2 className="font-display text-3xl text-[var(--ink-strong)]">Ruleta DrinkLeague</h2>
      <p className="text-sm text-[var(--muted)]">
        Gira con amigos. Bebidas, duelos y salvaciones — sin apostar fichas.
      </p>

      <div className="flex justify-center gap-2">
        <button
          type="button"
          className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
            soundOn ? "border-[var(--amber)] text-[var(--amber)]" : "border-[var(--line)]"
          }`}
          onClick={() => setSoundOn((v) => !v)}
        >
          🔊 Sonido {soundOn ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
            vibeOn ? "border-[var(--teal)] text-[var(--teal)]" : "border-[var(--line)]"
          }`}
          onClick={() => setVibeOn((v) => !v)}
        >
          📳 Vibra {vibeOn ? "ON" : "OFF"}
        </button>
      </div>

      <div className="roulette-stage">
        <div className="roulette-pointer" aria-hidden />
        <div
          ref={wheelRef}
          className="roulette-wheel"
          style={{
            background: `conic-gradient(from -90deg, ${conic})`,
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? "transform 4.2s cubic-bezier(0.12, 0.75, 0.08, 1)"
              : "none",
          }}
        >
          {SEGMENTS.map((s, i) => (
            <span
              key={s.key}
              className="roulette-label"
              style={{
                transform: `rotate(${(i + 0.5) * (360 / SEGMENTS.length)}deg)`,
              }}
            >
              {s.label.split(" ")[0]}
            </span>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {!result ? (
        <button
          type="button"
          disabled={spinning || pending}
          onClick={spin}
          className="btn-primary min-h-14 w-full text-base"
        >
          {spinning || pending ? "Girando…" : "🔄 Girar"}
        </button>
      ) : (
        <div className="roulette-result roulette-result-celebrate roulette-result-fullscreen">
          <div className="roulette-confetti" aria-hidden />
          <p className="text-5xl" aria-hidden>
            {result.label?.slice(0, 2) ?? "🎉"}
          </p>
          <h3 className="font-display text-4xl">{result.label ?? result.result}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">¡A cumplir el destino!</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={spinning || pending}
              onClick={spin}
              className="mega-cta !min-h-14 !text-base"
            >
              🔄 Jugar otra vez
            </button>
            <button
              type="button"
              onClick={() => router.push("/app/games")}
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
