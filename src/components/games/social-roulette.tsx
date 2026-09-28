"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { spinSocialRouletteAction } from "@/app/actions";

type Rarity = "common" | "rare" | "epic" | "legendary";

const SEGMENTS = [
  { key: "cerveza", label: "Cerveza", emoji: "🍺", color: "#c4a35a", rarity: "common" as Rarity },
  { key: "chupito", label: "Chupito", emoji: "🥃", color: "#7c5cff", rarity: "common" as Rarity },
  { key: "copa", label: "Copa", emoji: "🍸", color: "#2dd4bf", rarity: "rare" as Rarity },
  { key: "cerveza_x2", label: "Cerveza x2", emoji: "🍺", color: "#e8b84a", rarity: "rare" as Rarity },
  { key: "chupito_x2", label: "Chupito x2", emoji: "🥃", color: "#a78bfa", rarity: "epic" as Rarity },
  { key: "te_salvas", label: "Te salvas", emoji: "😇", color: "#34d399", rarity: "epic" as Rarity },
  { key: "elige_jugador", label: "Elige jugador", emoji: "🤝", color: "#60a5fa", rarity: "rare" as Rarity },
  { key: "todos_beben", label: "Todos beben", emoji: "🔥", color: "#f87171", rarity: "legendary" as Rarity },
  { key: "duelo_rapido", label: "Duelo rapido", emoji: "⚔️", color: "#fb923c", rarity: "epic" as Rarity },
  { key: "rey_bebe", label: "Rey bebe", emoji: "👑", color: "#fbbf24", rarity: "legendary" as Rarity },
] as const;

const RARITY_GLOW: Record<Rarity, string> = {
  common: "rgba(200,200,200,0.25)",
  rare: "rgba(96,165,250,0.55)",
  epic: "rgba(167,139,250,0.65)",
  legendary: "rgba(240,162,2,0.75)",
};

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

function playTick(freq = 520) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.value = 0.045;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    o.stop(ctx.currentTime + 0.08);
    window.setTimeout(() => ctx.close(), 120);
  } catch {
    /* optional */
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
  const [showFullscreen, setShowFullscreen] = useState(false);
  const tickRef = useRef<number | null>(null);
  const segAngle = 360 / SEGMENTS.length;

  const conic = useMemo(() => {
    return SEGMENTS.map((s, i) => {
      const start = (i / SEGMENTS.length) * 100;
      const end = ((i + 1) / SEGMENTS.length) * 100;
      return `${s.color} ${start}% ${end}%`;
    }).join(", ");
  }, []);

  function stopTicks() {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  useEffect(() => () => stopTicks(), []);

  function spin() {
    if (spinning || pending) return;
    setError(null);
    setResult(null);
    setShowFullscreen(false);
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
        const target =
          rotation + 360 * 7 + (360 - (idx * segAngle + segAngle / 2));
        setRotation(target);

        if (vibeOn) vibrate(25);
        if (soundOn) {
          stopTicks();
          let f = 620;
          tickRef.current = window.setInterval(() => {
            playTick(f);
            f = Math.max(220, f - 12);
            if (vibeOn) vibrate(8);
          }, 85);
        }

        window.setTimeout(() => {
          stopTicks();
          setResult(payload);
          setSpinning(false);
          setShowFullscreen(true);
          if (soundOn) playTick(780);
          if (vibeOn) vibrate([40, 30, 90]);
          router.refresh();
        }, 5200);
      } catch {
        stopTicks();
        setError("No se pudo girar.");
        setSpinning(false);
      }
    });
  }

  const seg =
    result && typeof result.index === "number"
      ? SEGMENTS[result.index]
      : result
        ? SEGMENTS.find((s) => s.key === result.result)
        : null;

  return (
    <div className="game-card game-card-ruleta-social social-wheel-card space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
        Social · Sin fichas
      </p>
      <h2 className="font-display text-3xl text-[var(--ink-strong)]">Ruleta DrinkLeague</h2>
      <p className="text-sm text-[var(--muted)]">
        Gira con amigos. Bebidas, duelos y salvaciones.
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

      <div className={`social-wheel-stage ${spinning ? "social-wheel-spinning" : ""}`}>
        <div className="social-wheel-aura" aria-hidden />
        <div className="social-wheel-ring" aria-hidden />
        <div className="social-wheel-pointer" aria-hidden />
        <div
          className="social-wheel"
          style={{
            background: `conic-gradient(from -90deg, ${conic})`,
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? "transform 5.2s cubic-bezier(0.08, 0.7, 0.05, 1)"
              : "none",
          }}
        >
          {SEGMENTS.map((s, i) => (
            <span
              key={s.key}
              className={`social-wheel-label rarity-${s.rarity}`}
              style={{
                transform: `rotate(${(i + 0.5) * segAngle}deg)`,
                textShadow: `0 0 10px ${RARITY_GLOW[s.rarity]}`,
              }}
            >
              <span className="social-wheel-emoji">{s.emoji}</span>
            </span>
          ))}
        </div>
        <div className="social-wheel-hub font-display">DL</div>
        <div className="social-wheel-sparks" aria-hidden />
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {!result ? (
        <button
          type="button"
          disabled={spinning || pending}
          onClick={spin}
          className="mega-cta !min-h-14 w-full !text-base"
        >
          {spinning || pending ? "Girando…" : "🎡 Girar"}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
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
      )}

      {showFullscreen && seg ? (
        <div
          className={`social-result-overlay rarity-bg-${seg.rarity}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="social-result-burst" aria-hidden />
          <p className="social-result-emoji">{seg.emoji}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--gold)]">
            {seg.rarity === "legendary"
              ? "Legendaria"
              : seg.rarity === "epic"
                ? "Epica"
                : seg.rarity === "rare"
                  ? "Rara"
                  : "Comun"}
          </p>
          <h3 className="font-display text-4xl sm:text-5xl">{seg.label}</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">¡A cumplir el destino!</p>
          <div className="mt-6 grid w-full max-w-sm grid-cols-2 gap-3 px-4">
            <button
              type="button"
              className="mega-cta !min-h-14 !text-base"
              onClick={() => {
                setShowFullscreen(false);
                spin();
              }}
            >
              🔄 Otra vez
            </button>
            <button
              type="button"
              className="btn-primary min-h-14 text-base"
              onClick={() => {
                setShowFullscreen(false);
                router.push("/app/games");
              }}
            >
              🚪 Salir
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
