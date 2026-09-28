"use client";

import { useState } from "react";
import { startGameAction } from "@/app/actions";

const ART: Record<string, { emoji: string; className: string; tag: string }> = {
  peaje: { emoji: "🚧", className: "game-card-peaje", tag: "Suerte" },
  rey: { emoji: "👑", className: "game-card-rey", tag: "Baraja española" },
  duelo: { emoji: "⚔️", className: "game-card-duelo", tag: "1 vs 1" },
  blackjack: { emoji: "🃏", className: "game-card-blackjack", tag: "Casino" },
};

const RULES: Record<string, string[]> = {
  peaje: [
    "Carta 1–2: Par o Impar",
    "Carta 3: Peaje obligatorio",
    "Carta 4–5: Mayor o Menor",
    "Si fallas → bebes y un paso atrás",
  ],
  rey: [
    "Baraja española de 40 cartas",
    "Cada carta tiene una acción de beber",
    "Cuenta Reyes 0/4 → 4/4",
    "Al 4º Rey termina la partida",
  ],
  duelo: [
    "Elige rival (amigo o nombre)",
    "Una carta española a cada uno",
    "La más alta gana · la baja bebe",
    "Empate → desempate automático",
  ],
  blackjack: [
    "Baraja de póker clásica · A–K · ♠♥♦♣",
    "Pedir Carta o Plantarse",
    "Dealer se planta en 17",
    "BlackJack natural = 21 con 2 cartas",
  ],
};

function extractSessionId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>).sessionId;
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (raw != null) {
    const s = String(raw).trim();
    return s.length > 0 ? s : null;
  }
  return null;
}

export function StartGameForm({
  gameType,
  label,
  blurb,
  needsOpponent,
  compact,
  friends,
}: {
  gameType: "peaje" | "rey" | "duelo" | "blackjack";
  label: string;
  blurb?: string;
  needsOpponent?: boolean;
  compact?: boolean;
  friends?: Array<{ id: string; display_name: string; friend_code: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"friend" | "guest">("friend");
  const art = ART[gameType];

  async function onSubmit(fd: FormData) {
    setError(null);
    setPending(true);
    try {
      // Ensure game type is always present even if form fields are odd on mobile
      if (!fd.get("game_type")) fd.set("game_type", gameType);

      const r = await startGameAction(fd);
      if (r?.error) {
        setError(r.error);
        setPending(false);
        return;
      }
      const sessionId = extractSessionId(r?.payload);
      if (!sessionId) {
        setError("No se pudo abrir la partida.");
        setPending(false);
        return;
      }
      // Stable route (avoids Netlify 404 on /app/games/[uuid])
      window.location.assign(`/app/games/play?id=${encodeURIComponent(sessionId)}`);
    } catch {
      setError("No se pudo abrir la partida. Inténtalo de nuevo.");
      setPending(false);
    }
  }

  if (compact) {
    return (
      <form action={onSubmit}>
        <input type="hidden" name="game_type" value={gameType} />
        <button type="submit" disabled={pending} className="btn-ghost min-h-11 text-xs">
          {pending ? "…" : label}
        </button>
        {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      </form>
    );
  }

  return (
    <form className={`game-card ${art.className}`} action={onSubmit}>
      <input type="hidden" name="game_type" value={gameType} />
      <p className="absolute right-4 top-4 text-4xl opacity-90" aria-hidden>
        {art.emoji}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        {art.tag}
      </p>
      <h2 className="font-display text-3xl text-[var(--ink-strong)]">{label}</h2>
      {blurb ? <p className="mt-1 text-sm text-[var(--muted)]">{blurb}</p> : null}

      <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
        {(RULES[gameType] ?? []).map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>

      {needsOpponent ? (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              className={`min-h-10 flex-1 rounded-full text-xs font-semibold ${
                mode === "friend" ? "bg-[var(--ink)] text-[#0b1512]" : "border border-[var(--line)]"
              }`}
              onClick={() => setMode("friend")}
            >
              Amigo
            </button>
            <button
              type="button"
              className={`min-h-10 flex-1 rounded-full text-xs font-semibold ${
                mode === "guest" ? "bg-[var(--ink)] text-[#0b1512]" : "border border-[var(--line)]"
              }`}
              onClick={() => setMode("guest")}
            >
              Nombre
            </button>
          </div>
          {mode === "friend" ? (
            <>
              {(friends ?? []).length > 0 ? (
                <select className="input min-h-12" name="opponent_user_id" defaultValue="">
                  <option value="">Elige jugador…</option>
                  {friends!.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.display_name}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                className="input min-h-12"
                name="opponent_code"
                placeholder="O código amigo"
                maxLength={12}
              />
            </>
          ) : (
            <input
              className="input min-h-12"
              name="opponent_name"
              placeholder="Nombre del rival (ej. David)"
              required
              maxLength={40}
            />
          )}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="btn-primary mt-4 min-h-14 w-full text-base"
      >
        {pending ? "Abriendo…" : "Jugar"}
      </button>
    </form>
  );
}
