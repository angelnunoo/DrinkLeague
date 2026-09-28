"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { playPeajeStepAction, drawReyAction, playDueloAction } from "@/app/actions";
import { SpanishPlayingCard, type SpanishCard, SUIT_META, RANK_LABELS } from "./spanish-card";

type PeajeState = {
  phase?: string;
  step?: number;
  hits?: number;
  misses?: number;
  last_card?: SpanishCard;
  last_result?: string;
  history?: Array<{ step: number; card: SpanishCard; result: string }>;
  won?: boolean;
  perfect?: boolean;
  xp?: number;
  tokens?: number;
};

export function PeajePlay({ sessionId, initial }: { sessionId: string; initial: PeajeState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const phase = initial.phase ?? "intro";
  const step = initial.step ?? 0;

  function run(guess: string) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await playPeajeStepAction(sessionId, guess);
        if (r?.error) {
          setError(r.error);
          return;
        }
        router.refresh();
      } catch {
        setError("No se pudo jugar este paso. Reintenta.");
      }
    });
  }

  if (phase === "intro") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-[var(--muted)]">
          6 cartas españolas. Acierta Par/Impar, supera el peaje, Mayor/Menor y el palo final.
        </p>
        <ol className="space-y-2 text-left text-sm text-[var(--muted)]">
          <li>1–2 · Par o Impar</li>
          <li>3 · Peaje obligatorio</li>
          <li>4–5 · Mayor o Menor</li>
          <li>6 · Adivina el palo</li>
        </ol>
        <button type="button" disabled={pending} className="mega-cta !text-lg" onClick={() => run("start")}>
          {pending ? "Barajando…" : "Barajar y jugar"}
        </button>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>
    );
  }

  if (phase === "finished" || initial.won != null) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-5xl">{initial.perfect ? "🏎️" : initial.won ? "✅" : "🚧"}</p>
        <h2 className="font-display text-3xl">
          {initial.perfect ? "¡Peaje perfecto!" : initial.won ? "¡Has ganado!" : "Fin del peaje"}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-chip p-3">
            <p className="text-[10px] text-[var(--muted)]">Aciertos</p>
            <p className="font-display text-2xl text-[var(--teal)]">{initial.hits ?? 0}</p>
          </div>
          <div className="stat-chip p-3">
            <p className="text-[10px] text-[var(--muted)]">Fallos</p>
            <p className="font-display text-2xl text-[var(--danger)]">{initial.misses ?? 0}</p>
          </div>
          <div className="stat-chip p-3">
            <p className="text-[10px] text-[var(--muted)]">XP</p>
            <p className="font-display text-2xl">+{initial.xp ?? 0}</p>
          </div>
          <div className="stat-chip p-3">
            <p className="text-[10px] text-[var(--muted)]">Fichas</p>
            <p className="font-display text-2xl text-[var(--amber)]">+{initial.tokens ?? 0}</p>
          </div>
        </div>
        <HistoryList history={initial.history} />
      </div>
    );
  }

  const prompt =
    step === 0
      ? "Carta 1: ¿Par o Impar?"
      : step === 1
        ? "Carta 2: ¿Par o Impar?"
        : step === 2
          ? "Carta 3: Peaje obligatorio"
          : step === 3
            ? "Carta 4: ¿Mayor o Menor?"
            : step === 4
              ? "Carta 5: ¿Mayor o Menor?"
              : "Carta final: ¿Palo?";

  return (
    <div className="space-y-5">
      <div className="flex justify-center gap-4 text-center">
        <div>
          <p className="text-[10px] text-[var(--muted)]">Aciertos</p>
          <p className="font-display text-2xl text-[var(--teal)]">{initial.hits ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--muted)]">Fallos</p>
          <p className="font-display text-2xl text-[var(--danger)]">{initial.misses ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--muted)]">Paso</p>
          <p className="font-display text-2xl">{Math.min(step + 1, 6)}/6</p>
        </div>
      </div>

      {initial.last_card ? (
        <div className="space-y-2 text-center">
          <SpanishPlayingCard card={initial.last_card} size="lg" />
          <p
            className={`text-sm font-semibold ${
              initial.last_result === "hit"
                ? "text-[var(--teal)]"
                : initial.last_result === "miss"
                  ? "text-[var(--danger)]"
                  : "text-[var(--amber)]"
            }`}
          >
            {initial.last_result === "hit"
              ? "✅ Acierto"
              : initial.last_result === "miss"
                ? "❌ Fallo"
                : "🍺 Peaje"}
          </p>
        </div>
      ) : (
        <SpanishPlayingCard faceDown size="lg" />
      )}

      <p className="text-center font-display text-xl">{prompt}</p>

      <div className="grid grid-cols-2 gap-3">
        {step <= 1 ? (
          <>
            <GuessBtn disabled={pending} onClick={() => run("odd")} label="Impar" />
            <GuessBtn disabled={pending} onClick={() => run("even")} label="Par" />
          </>
        ) : null}
        {step === 2 ? (
          <GuessBtn disabled={pending} onClick={() => run("continue")} label="🍺 Beber peaje" wide />
        ) : null}
        {step === 3 || step === 4 ? (
          <>
            <GuessBtn disabled={pending} onClick={() => run("higher")} label="Mayor" />
            <GuessBtn disabled={pending} onClick={() => run("lower")} label="Menor" />
          </>
        ) : null}
        {step === 5
          ? (["oros", "copas", "espadas", "bastos"] as const).map((s) => (
              <GuessBtn
                key={s}
                disabled={pending}
                onClick={() => run(s)}
                label={`${SUIT_META[s].symbol} ${SUIT_META[s].label}`}
              />
            ))
          : null}
      </div>
      {error ? <p className="text-center text-sm text-[var(--danger)]">{error}</p> : null}
      <HistoryList history={initial.history} />
    </div>
  );
}

function GuessBtn({
  label,
  onClick,
  disabled,
  wide,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`btn-primary min-h-14 text-base ${wide ? "col-span-2" : ""}`}
    >
      {label}
    </button>
  );
}

function HistoryList({
  history,
}: {
  history?: Array<{ step: number; card: SpanishCard; result: string }>;
}) {
  if (!history?.length) return null;
  return (
    <ul className="space-y-2 text-left text-sm">
      {history.map((h, i) => (
        <li key={i} className="rank-row flex justify-between px-3 py-2">
          <span>
            #{h.step + 1} {RANK_LABELS[h.card?.rank] ?? "?"}{" "}
            {SUIT_META[h.card?.suit]?.symbol ?? ""}
          </span>
          <span
            className={
              h.result === "hit"
                ? "text-[var(--teal)]"
                : h.result === "miss"
                  ? "text-[var(--danger)]"
                  : "text-[var(--amber)]"
            }
          >
            {h.result}
          </span>
        </li>
      ))}
    </ul>
  );
}

type ReyState = {
  phase?: string;
  kings?: number;
  turns?: number;
  last_card?: SpanishCard;
  last_effect?: string;
  history?: Array<{ card: SpanishCard; effect: string }>;
  xp?: number;
  tokens?: number;
  duration_sec?: number;
};

export function ReyPlay({
  sessionId,
  initial,
  players,
}: {
  sessionId: string;
  initial: ReyState;
  players: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const phase = initial.phase ?? "intro";
  const kings = initial.kings ?? 0;
  const finished = phase === "finished";

  function draw() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await drawReyAction(sessionId);
        if (r?.error) {
          setError(r.error);
          return;
        }
        router.refresh();
      } catch {
        setError("No se pudo sacar carta. Reintenta.");
      }
    });
  }

  if (phase === "intro") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-[var(--muted)]">
          Baraja española de 40 cartas. Saca hasta encontrar los 4 Reyes.
        </p>
        <button type="button" disabled={pending} className="mega-cta !text-lg" onClick={draw}>
          {pending ? "…" : "Empezar · Sacar carta"}
        </button>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5 text-center">
      <div className="flex justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg ${
              i < kings
                ? "border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_25%,transparent)]"
                : "border-[var(--line)] text-[var(--muted)]"
            }`}
          >
            👑
          </span>
        ))}
      </div>
      <p className="font-display text-2xl">Reyes {kings}/4</p>

      {initial.last_card ? (
        <>
          <SpanishPlayingCard card={initial.last_card} size="lg" />
          <p className="rounded-2xl border border-[var(--line)] px-4 py-3 text-base font-semibold">
            {initial.last_effect}
          </p>
        </>
      ) : (
        <SpanishPlayingCard faceDown size="lg" />
      )}

      {finished ? (
        <div className="space-y-3">
          <p className="font-display text-2xl text-[var(--teal)]">¡Salieron los 4 Reyes!</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="stat-chip p-3">
              <p className="text-[10px] text-[var(--muted)]">Cartas</p>
              <p className="font-display text-2xl">{initial.turns ?? 0}</p>
            </div>
            <div className="stat-chip p-3">
              <p className="text-[10px] text-[var(--muted)]">Duración</p>
              <p className="font-display text-2xl">{formatDuration(initial.duration_sec)}</p>
            </div>
            <div className="stat-chip p-3">
              <p className="text-[10px] text-[var(--muted)]">XP</p>
              <p className="font-display text-2xl">+{initial.xp ?? 0}</p>
            </div>
            <div className="stat-chip p-3">
              <p className="text-[10px] text-[var(--muted)]">Fichas</p>
              <p className="font-display text-2xl text-[var(--amber)]">+{initial.tokens ?? 0}</p>
            </div>
          </div>
          <p className="text-sm text-[var(--muted)]">Participantes: {players.join(" · ") || "—"}</p>
        </div>
      ) : (
        <button type="button" disabled={pending} className="mega-cta !text-lg" onClick={draw}>
          {pending ? "Sacando…" : "Sacar carta"}
        </button>
      )}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

type DueloState = {
  phase?: string;
  guest_name?: string | null;
  last?: {
    card1?: SpanishCard;
    card2?: SpanishCard;
    name1?: string;
    name2?: string;
    winner?: string;
    loser?: string;
    ties?: number;
  };
  xp?: number;
  tokens?: number;
  ties?: number;
  won_by_me?: boolean;
};

export function DueloPlay({
  sessionId,
  initial,
  meName,
  rivalName,
}: {
  sessionId: string;
  initial: DueloState;
  meName: string;
  rivalName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const phase = initial.phase ?? "intro";
  const finished = phase === "finished";
  const last = initial.last;

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await playDueloAction(sessionId);
        if (r?.error) {
          setError(r.error);
          return;
        }
        router.refresh();
      } catch {
        setError("No se pudo repartir. Reintenta.");
      }
    });
  }

  if (phase === "intro") {
    return (
      <div className="space-y-5 text-center">
        <div className="grid grid-cols-2 gap-3">
          <div className="surface p-4">
            <p className="text-[10px] text-[var(--muted)]">Jugador 1</p>
            <p className="font-display text-xl">{meName}</p>
          </div>
          <div className="surface p-4">
            <p className="text-[10px] text-[var(--muted)]">Jugador 2</p>
            <p className="font-display text-xl">{rivalName}</p>
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Carta española a cada uno. La más alta gana. Empate → desempate automático.
        </p>
        <button type="button" disabled={pending} className="mega-cta !text-lg" onClick={start}>
          {pending ? "Repartiendo…" : "Comenzar Duelo"}
        </button>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5 text-center">
      <div className="flex items-end justify-center gap-3">
        <div>
          <p className="mb-2 text-sm font-semibold">{last?.name1 ?? meName}</p>
          <SpanishPlayingCard card={last?.card1} size="md" />
        </div>
        <span className="pb-10 font-display text-2xl text-[var(--danger)]">VS</span>
        <div>
          <p className="mb-2 text-sm font-semibold">{last?.name2 ?? rivalName}</p>
          <SpanishPlayingCard card={last?.card2} size="md" />
        </div>
      </div>

      {finished ? (
        <div className="space-y-3">
          <p className="font-display text-3xl text-[var(--teal)]">
            ✅ {last?.winner ?? "—"} gana
          </p>
          <p className="text-lg text-[var(--amber)]">🍺 {last?.loser ?? "—"} pierde</p>
          {(initial.ties ?? last?.ties ?? 0) > 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Desempates: {initial.ties ?? last?.ties}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="stat-chip p-3">
              <p className="text-[10px] text-[var(--muted)]">XP</p>
              <p className="font-display text-2xl">+{initial.xp ?? 0}</p>
            </div>
            <div className="stat-chip p-3">
              <p className="text-[10px] text-[var(--muted)]">Fichas</p>
              <p className="font-display text-2xl text-[var(--amber)]">+{initial.tokens ?? 0}</p>
            </div>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

function formatDuration(sec?: number) {
  if (!sec || sec < 1) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
