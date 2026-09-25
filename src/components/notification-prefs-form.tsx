"use client";

import { useState, useTransition } from "react";
import { updateNotificationPrefsAction } from "@/app/actions";

const TOGGLES: Array<{ key: string; label: string }> = [
  { key: "rivalry", label: "Rivalidades" },
  { key: "ranking", label: "Clasificaciones" },
  { key: "achievement", label: "Logros" },
  { key: "chemistry", label: "Química" },
  { key: "bets", label: "Apuestas" },
  { key: "boost", label: "SuperAumentos" },
  { key: "mvp", label: "MVP" },
  { key: "games", label: "Juegos" },
  { key: "events", label: "Eventos" },
  { key: "birthday", label: "Cumpleaños" },
  { key: "challenges", label: "Retos" },
  { key: "weekly", label: "Resúmenes semanales" },
  { key: "push_enabled", label: "Push en este perfil" },
];

type Prefs = Record<string, boolean | string | null | undefined> | null;

export function NotificationPrefsForm({ prefs }: { prefs: Prefs }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [state, setState] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const t of TOGGLES) {
      init[t.key] = prefs?.[t.key] !== false;
    }
    return init;
  });

  return (
    <form
      className="surface space-y-3 p-4"
      action={() => {
        setMsg(null);
        startTransition(async () => {
          const r = await updateNotificationPrefsAction(state);
          if (r?.error) setMsg(r.error);
          else setMsg("Preferencias guardadas.");
        });
      }}
    >
      <h2 className="font-display text-xl">Preferencias</h2>
      <p className="text-xs text-[var(--muted)]">
        Solo eventos reales. Sin mensajes vacíos para abrir la app.
      </p>
      <ul className="space-y-2">
        {TOGGLES.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5">
            <span className="text-sm font-semibold">{t.label}</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--amber)]"
              checked={state[t.key] ?? true}
              onChange={(e) => setState((s) => ({ ...s, [t.key]: e.target.checked }))}
            />
          </li>
        ))}
      </ul>
      <button type="submit" className="btn-primary w-full text-sm">
        Guardar
      </button>
      {msg ? <p className="text-sm text-[var(--teal)]">{msg}</p> : null}
    </form>
  );
}
