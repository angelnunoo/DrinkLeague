"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { playBingoAction } from "@/app/actions";

const STAKES = [50, 100, 250, 500, 1000] as const;

type Friend = { id: string; display_name: string };
type PlayerSlot = { name: string; user_id: string };
type BingoPlayer = {
  seat: number;
  name: string;
  user_id?: string | null;
  card: number[];
};
type BingoPayload = {
  stake?: number;
  pot?: number;
  players?: BingoPlayer[];
  drawn?: number[];
  draw_count?: number;
  winner_seat?: number;
  winner?: string;
  line?: boolean;
  bingo?: boolean;
  session_id?: string;
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

export function BingoBoard({
  tokenBalance,
  friends,
  meName,
  meId,
}: {
  tokenBalance: number;
  friends?: Friend[];
  meName: string;
  meId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stake, setStake] = useState(100);
  const [count, setCount] = useState<2 | 3 | 4>(3);
  const [players, setPlayers] = useState<PlayerSlot[]>([
    { name: meName, user_id: "me" },
    { name: "", user_id: "" },
    { name: "", user_id: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<BingoPayload | null>(null);
  const [drawIdx, setDrawIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState(false);
  const bal = Number(tokenBalance ?? 0);

  const active = useMemo(() => players.slice(0, count), [players, count]);
  const drawn = payload?.drawn ?? [];
  const visibleDrawn = drawn.slice(0, Math.max(0, drawIdx + 1));
  const lastBall = visibleDrawn[visibleDrawn.length - 1];

  function setCountSafe(n: 2 | 3 | 4) {
    setCount(n);
    setPlayers((prev) => {
      const next = [...prev];
      while (next.length < n) next.push({ name: "", user_id: "" });
      if (next[0] && !next[0].name) next[0] = { name: meName, user_id: "me" };
      return next;
    });
  }

  function start() {
    setError(null);
    const payloadPlayers = active.map((p, i) => ({
      name: (i === 0 ? meName || p.name : p.name).trim(),
      user_id: i === 0 ? meId : p.user_id && p.user_id !== "me" ? p.user_id : null,
    }));
    if (payloadPlayers.some((p) => !p.name)) {
      setError("Pon nombre a todos los jugadores.");
      return;
    }
    const hostCost =
      payloadPlayers.filter((p) => !p.user_id || p.user_id === meId).length * stake;
    if (hostCost > bal) {
      setError("💰 No tienes fichas suficientes para jugar.");
      return;
    }

    setPayload(null);
    setDrawIdx(-1);
    setDone(false);
    setPlaying(false);
    startTransition(async () => {
      try {
        const r = await playBingoAction(stake, payloadPlayers);
        if (r?.error) {
          setError(r.error);
          return;
        }
        const data = (r?.payload ?? {}) as BingoPayload;
        const normalized: BingoPayload = {
          ...data,
          players: (data.players ?? []).map((p) => ({
            ...p,
            card: Array.isArray(p.card)
              ? p.card.map((n) => Number(n))
              : [],
          })),
          drawn: Array.isArray(data.drawn) ? data.drawn.map((n) => Number(n)) : [],
        };
        setPayload(normalized);
        setPlaying(true);
        vibrate(30);
        router.refresh();
      } catch {
        setError("No se pudo iniciar el bingo.");
      }
    });
  }

  useEffect(() => {
    if (!playing || !payload?.drawn?.length) return;
    if (drawIdx >= (payload.drawn?.length ?? 0) - 1) {
      setPlaying(false);
      setDone(true);
      setFlash(true);
      vibrate([40, 40, 100]);
      window.setTimeout(() => setFlash(false), 1800);
      return;
    }
    const t = window.setTimeout(() => {
      setDrawIdx((i) => i + 1);
      vibrate(18);
    }, 420);
    return () => window.clearTimeout(t);
  }, [playing, drawIdx, payload]);

  function markedCount(card: number[]) {
    return card.filter((n) => visibleDrawn.includes(n)).length;
  }

  function hasLine(card: number[]) {
    // 5x3 grid rows
    for (let row = 0; row < 3; row++) {
      const slice = card.slice(row * 5, row * 5 + 5);
      if (slice.length === 5 && slice.every((n) => visibleDrawn.includes(n))) return true;
    }
    return false;
  }

  return (
    <div className={`game-card game-card-bingo space-y-4 ${flash ? "bingo-flash" : ""}`}>
      <p className="absolute right-4 top-4 text-4xl opacity-90" aria-hidden>
        🎱
      </p>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        DrinkCasino · Cartones
      </p>
      <h2 className="font-display text-3xl text-[var(--ink-strong)]">Bingo</h2>
      <p className="text-sm text-[var(--muted)]">
        Entrada al bote · Saldo {bal.toLocaleString("es-ES")} ★
      </p>

      {!payload ? (
        <>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Entrada</p>
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

          <div className="flex gap-2">
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCountSafe(n)}
                className={`min-h-10 flex-1 rounded-full text-xs font-semibold ${
                  count === n ? "bg-[var(--ink)] text-[#0b1512]" : "border border-[var(--line)]"
                }`}
              >
                {n} jugadores
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {active.map((p, i) => (
              <div key={i} className="space-y-1">
                <p className="text-[10px] text-[var(--muted)]">Jugador {i + 1}</p>
                {i === 0 ? (
                  <input className="input min-h-11" value={meName} readOnly disabled />
                ) : (
                  <>
                    {(friends ?? []).length > 0 ? (
                      <select
                        className="input min-h-11"
                        value={p.user_id}
                        onChange={(e) => {
                          const id = e.target.value;
                          const f = friends?.find((x) => x.id === id);
                          setPlayers((prev) => {
                            const next = [...prev];
                            next[i] = { user_id: id, name: f?.display_name ?? "" };
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
                      placeholder="Nombre"
                      value={p.name}
                      maxLength={40}
                      onChange={(e) => {
                        const name = e.target.value;
                        setPlayers((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], name };
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
            Bote · {(stake * count).toLocaleString("es-ES")} ★
          </p>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <button
            type="button"
            disabled={pending}
            onClick={start}
            className="btn-primary min-h-14 w-full text-base"
          >
            {pending ? "Preparando…" : `🎱 Jugar · ${stake} ★`}
          </button>
        </>
      ) : (
        <>
          <div className="bingo-ball-stage">
            <div className={`bingo-ball ${lastBall != null ? "bingo-ball-pop" : ""}`}>
              {lastBall ?? "·"}
            </div>
            <p className="text-center text-xs text-[var(--muted)]">
              Bola {Math.max(0, drawIdx + 1)} / {drawn.length}
              {payload.pot ? ` · Bote ${payload.pot} ★` : ""}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(payload.players ?? []).map((p) => {
              const marked = markedCount(p.card ?? []);
              const line = hasLine(p.card ?? []);
              const isWinner = done && p.seat === payload.winner_seat;
              return (
                <div
                  key={p.seat}
                  className={`bingo-card ${line ? "bingo-card-line" : ""} ${
                    isWinner ? "bingo-card-win" : ""
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-[10px] text-[var(--muted)]">{marked}/15</p>
                  </div>
                  <div className="bingo-grid">
                    {(p.card ?? []).map((n) => {
                      const on = visibleDrawn.includes(n);
                      return (
                        <span key={`${p.seat}-${n}`} className={on ? "bingo-cell-on" : ""}>
                          {n}
                        </span>
                      );
                    })}
                  </div>
                  {line && !isWinner ? (
                    <p className="mt-2 text-center text-xs text-[var(--teal)]">✅ Línea</p>
                  ) : null}
                  {isWinner ? (
                    <p className="mt-2 text-center font-display text-lg text-[var(--amber)]">
                      🏆 BINGO
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {done ? (
            <div className="bj-result bj-result-win space-y-3">
              <div className="roulette-confetti" aria-hidden />
              <p className="text-5xl">🏆</p>
              <h3 className="font-display text-3xl">Bingo</h3>
              <p className="font-display text-2xl text-[var(--amber)]">{payload.winner}</p>
              <p className="text-sm text-[var(--muted)]">
                Bote · {(payload.pot ?? 0).toLocaleString("es-ES")} ★
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setPayload(null);
                    setDrawIdx(-1);
                    setDone(false);
                  }}
                  className="mega-cta !min-h-14 !text-base"
                >
                  🔄 Jugar otro Bingo
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
          ) : (
            <p className="text-center text-xs text-[var(--muted)]">Sacando bolas…</p>
          )}
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </>
      )}
    </div>
  );
}
