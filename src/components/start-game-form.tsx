"use client";

import { useMemo, useState } from "react";
import { startGameAction } from "@/app/actions";

const STAKES = [50, 100, 250, 500, 1000] as const;

const ART: Record<string, { emoji: string; className: string; tag: string }> = {
  peaje: { emoji: "🚧", className: "game-card-peaje", tag: "Suerte" },
  rey: { emoji: "👑", className: "game-card-rey", tag: "Baraja española" },
  duelo: { emoji: "⚔️", className: "game-card-duelo", tag: "1 vs 1" },
  blackjack: { emoji: "🃏", className: "game-card-blackjack", tag: "Casino" },
  carrera: { emoji: "🐎", className: "game-card-carrera", tag: "Hipódromo" },
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
    "Apuesta fichas antes de jugar",
    "Victoria = apuesta ×2 · BJ = ×2.5",
    "Empate devuelve la apuesta",
    "Derrota = pierdes la apuesta",
  ],
  carrera: [
    "2 a 4 caballos (amigos o nombres)",
    "Todos aportan al bote",
    "Carrera automática con eventos",
    "1º se lleva el bote · 2º recupera mitad",
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

type Friend = { id: string; display_name: string; friend_code: string };
type HorseSlot = { name: string; user_id: string };

export function StartGameForm({
  gameType,
  label,
  blurb,
  needsOpponent,
  compact,
  friends,
  meName,
  meId,
  tokenBalance,
}: {
  gameType: "peaje" | "rey" | "duelo" | "blackjack" | "carrera";
  label: string;
  blurb?: string;
  needsOpponent?: boolean;
  compact?: boolean;
  friends?: Friend[];
  meName?: string;
  meId?: string;
  tokenBalance?: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"friend" | "guest">("friend");
  const [stake, setStake] = useState<number>(100);
  const [horseCount, setHorseCount] = useState<2 | 3 | 4>(3);
  const [horses, setHorses] = useState<HorseSlot[]>([
    { name: meName ?? "Tú", user_id: "me" },
    { name: "", user_id: "" },
    { name: "", user_id: "" },
  ]);
  const art = ART[gameType];
  const needsStake = gameType === "blackjack" || gameType === "carrera";
  const bal = Number(tokenBalance ?? 0);

  const activeHorses = useMemo(() => horses.slice(0, horseCount), [horses, horseCount]);

  function setHorseCountSafe(n: 2 | 3 | 4) {
    setHorseCount(n);
    setHorses((prev) => {
      const next = [...prev];
      while (next.length < n) next.push({ name: "", user_id: "" });
      if (next[0] && !next[0].name) next[0] = { name: meName ?? "Tú", user_id: "me" };
      return next;
    });
  }

  async function onSubmit(fd: FormData) {
    setError(null);
    setPending(true);
    try {
      if (!fd.get("game_type")) fd.set("game_type", gameType);
      if (needsStake) fd.set("stake", String(stake));

      if (gameType === "carrera") {
        const payload = activeHorses.map((h, i) => {
          const name = (i === 0 ? meName || h.name : h.name).trim();
          const user_id =
            i === 0 ? meId ?? null : h.user_id && h.user_id !== "me" ? h.user_id : null;
          return { name, user_id };
        });
        if (payload.some((p) => !p.name)) {
          setError("Pon nombre a todos los caballos.");
          setPending(false);
          return;
        }
        const hostCost =
          payload.filter((p) => !p.user_id || p.user_id === meId).length * stake;
        if (hostCost > bal) {
          setError("💰 No tienes fichas suficientes para jugar.");
          setPending(false);
          return;
        }
        fd.set("players", JSON.stringify(payload));
      }

      if (gameType === "blackjack" && stake > bal) {
        setError("💰 No tienes fichas suficientes para jugar.");
        setPending(false);
        return;
      }

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
        {needsStake ? <input type="hidden" name="stake" value={stake} /> : null}
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

      {needsStake ? (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Apuesta · Saldo {bal.toLocaleString("es-ES")} ★
          </p>
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
          <input type="hidden" name="stake" value={stake} />
        </div>
      ) : null}

      {gameType === "carrera" ? (
        <div className="mt-4 space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Caballos</p>
          <div className="flex gap-2">
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setHorseCountSafe(n)}
                className={`min-h-10 flex-1 rounded-full text-xs font-semibold ${
                  horseCount === n
                    ? "bg-[var(--ink)] text-[#0b1512]"
                    : "border border-[var(--line)]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {activeHorses.map((h, i) => (
              <div key={i} className="space-y-1">
                <p className="text-[10px] text-[var(--muted)]">🐎 Caballo {i + 1}</p>
                {i === 0 ? (
                  <input
                    className="input min-h-11"
                    value={meName ?? h.name}
                    readOnly
                    disabled
                  />
                ) : (
                  <>
                    {(friends ?? []).length > 0 ? (
                      <select
                        className="input min-h-11"
                        value={h.user_id}
                        onChange={(e) => {
                          const id = e.target.value;
                          const f = friends?.find((x) => x.id === id);
                          setHorses((prev) => {
                            const next = [...prev];
                            next[i] = {
                              user_id: id,
                              name: f?.display_name ?? "",
                            };
                            return next;
                          });
                        }}
                      >
                        <option value="">Amigo o escribe nombre…</option>
                        {friends!.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.display_name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <input
                      className="input min-h-11"
                      placeholder="Nombre del jinete"
                      value={h.name}
                      maxLength={40}
                      onChange={(e) => {
                        const name = e.target.value;
                        setHorses((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], name, user_id: next[i]?.user_id ?? "" };
                          return next;
                        });
                      }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--amber)]">
            Bote estimado · {(stake * horseCount).toLocaleString("es-ES")} ★
          </p>
        </div>
      ) : null}

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
        {pending ? "Abriendo…" : needsStake ? `Jugar · ${stake} ★` : "Jugar"}
      </button>
    </form>
  );
}
