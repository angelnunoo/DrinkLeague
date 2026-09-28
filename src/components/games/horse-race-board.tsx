"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runCarreraAction, startGameAction } from "@/app/actions";

export type Horse = {
  seat: number;
  name: string;
  user_id?: string | null;
  progress: number;
  color?: string;
  place?: number;
};

export type RaceTick = {
  round: number;
  advances: Array<{
    seat: number;
    name: string;
    add: number;
    progress: number;
    event?: string | null;
  }>;
  events?: Array<{ seat: number; name: string; event: string; bonus: number }>;
};

export type CarreraState = {
  phase?: string;
  stake?: number;
  pot?: number;
  track_length?: number;
  horses?: Horse[];
  ticks?: RaceTick[];
  standings?: Horse[];
  winner?: string;
};

const EVENT_LABEL: Record<string, string> = {
  sprint: "⚡ Sprint",
  aceleron: "💨 Acelerón",
  ultimo: "🔥 Último esfuerzo",
};

export function CarreraPlay({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: CarreraState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<CarreraState>(initial);
  const track = Number(live.track_length ?? 20);
  const ticks = live.ticks ?? [];
  const serverFinished = live.phase === "finished" || Boolean(live.winner);

  const [tickIdx, setTickIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [playbackDone, setPlaybackDone] = useState(serverFinished && !ticks.length);

  const horses = useMemo(() => {
    const baseHorses = live.horses ?? [];
    if (tickIdx < 0) {
      return baseHorses.map((h) => ({
        ...h,
        progress: serverFinished && !playing ? h.progress : 0,
      }));
    }
    const base = baseHorses.map((h) => ({ ...h, progress: 0 }));
    for (let t = 0; t <= tickIdx; t++) {
      const tick = ticks[t];
      if (!tick) continue;
      for (const a of tick.advances ?? []) {
        const h = base.find((x) => x.seat === a.seat);
        if (h) h.progress = a.progress;
      }
    }
    return base;
  }, [live.horses, tickIdx, ticks, serverFinished, playing]);

  useEffect(() => {
    if (!playing || !ticks.length) return;
    if (tickIdx >= ticks.length - 1) {
      setPlaying(false);
      setPlaybackDone(true);
      return;
    }
    const t = window.setTimeout(() => {
      const next = tickIdx + 1;
      setTickIdx(next);
      const ev = ticks[next]?.events?.[0];
      if (ev) {
        setBanner(`${EVENT_LABEL[ev.event] ?? ev.event} · ${ev.name}`);
        window.setTimeout(() => setBanner(null), 900);
      }
    }, 750);
    return () => window.clearTimeout(t);
  }, [playing, tickIdx, ticks]);

  function startRace() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await runCarreraAction(sessionId);
        if (r?.error) {
          setError(r.error);
          return;
        }
        const state = (r?.payload as { state?: CarreraState } | undefined)?.state;
        if (state) {
          setLive(state);
          setTickIdx(0);
          setPlaying(true);
          setPlaybackDone(false);
        } else {
          router.refresh();
        }
      } catch {
        setError("No se pudo iniciar la carrera.");
      }
    });
  }

  const showResult = serverFinished && (playbackDone || !ticks.length);
  const standings = live.standings ?? [];

  if ((live.phase === "intro" || !live.phase) && !serverFinished) {
    return (
      <div className="space-y-5 text-center">
        <p className="text-5xl" aria-hidden>
          🐎
        </p>
        <h2 className="font-display text-2xl">Carrera de Caballos</h2>
        <p className="text-sm text-[var(--muted)]">
          Bote · {(live.pot ?? 0).toLocaleString("es-ES")} ★ · Apuesta{" "}
          {(live.stake ?? 0).toLocaleString("es-ES")} ★
        </p>
        <ul className="space-y-2 text-left">
          {(live.horses ?? []).map((h) => (
            <li key={h.seat} className="rounded-2xl border border-[var(--line)] px-4 py-3">
              🐎 {h.name}
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={pending}
          onClick={startRace}
          className="mega-cta !min-h-14 !text-lg"
        >
          {pending ? "Preparando…" : "▶ Iniciar Carrera"}
        </button>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="carrera-board space-y-4">
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>🏁 META · {track}</span>
        <span>Bote {(live.pot ?? 0).toLocaleString("es-ES")} ★</span>
      </div>

      {banner ? (
        <p className="carrera-banner animate-pop text-center font-display text-lg text-[var(--amber)]">
          {banner}
        </p>
      ) : null}

      <div className="carrera-track space-y-3">
        {horses.map((h) => {
          const pct = Math.min(100, (Number(h.progress) / track) * 100);
          return (
            <div key={h.seat} className="carrera-lane">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold">🐎 {h.name}</span>
                <span className="tabular-nums text-[var(--muted)]">
                  {h.progress}/{track}
                </span>
              </div>
              <div className="carrera-bar">
                <div
                  className="carrera-fill"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${h.color ?? "#f59e0b"}, #fef3c7)`,
                  }}
                />
                <span
                  className="carrera-horse"
                  style={{ left: `min(calc(${pct}% - 0.85rem), calc(100% - 1.7rem))` }}
                  aria-hidden
                >
                  🐎
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {showResult ? (
        <div className="bj-result bj-result-win space-y-3">
          <p className="text-4xl" aria-hidden>
            🏆
          </p>
          <h2 className="font-display text-3xl">GANADOR</h2>
          <p className="font-display text-2xl text-[var(--amber)]">{live.winner}</p>
          <ol className="mt-3 space-y-2 text-left text-sm">
            {standings.map((s, i) => (
              <li
                key={s.seat}
                className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2"
              >
                <span>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`} 🐎 {s.name}
                </span>
                <span className="text-[var(--muted)]">{s.progress}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={pending}
              className="mega-cta !min-h-12 !text-base"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    const fd = new FormData();
                    fd.set("game_type", "carrera");
                    fd.set("stake", String(live.stake || 100));
                    const horses = (live.horses ?? live.standings ?? []).map((h) => ({
                      name: h.name,
                      user_id: h.user_id ?? null,
                    }));
                    fd.set("players", JSON.stringify(horses));
                    const r = await startGameAction(fd);
                    if (r?.error) {
                      setError(r.error);
                      return;
                    }
                    const nextId = (r?.payload as { sessionId?: string } | undefined)?.sessionId;
                    if (!nextId) {
                      setError("No se pudo abrir la nueva carrera.");
                      return;
                    }
                    window.location.assign(`/app/games/play?id=${encodeURIComponent(nextId)}`);
                  } catch {
                    setError("No se pudo iniciar otra carrera.");
                  }
                });
              }}
            >
              {pending ? "…" : "🔄 Nueva Carrera"}
            </button>
            <button
              type="button"
              className="btn-primary min-h-12 w-full"
              onClick={() => router.push("/app/casino")}
            >
              🚪 Salir
            </button>
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-[var(--muted)]">Carrera en curso…</p>
      )}

      {error ? <p className="text-center text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
