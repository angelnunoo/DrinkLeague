"use client";

import { useState, useTransition } from "react";
import { respondFriendRequestAction, sendFriendRequestAction } from "@/app/actions";
import { SubmitButton } from "@/components/auth-form";

export function FriendActions({
  mode = "add",
  requestId,
}: {
  mode?: "add" | "respond";
  requestId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (mode === "respond" && requestId) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary px-3 py-2 text-xs"
          onClick={() => {
            startTransition(async () => {
              const r = await respondFriendRequestAction(requestId, true);
              if (r?.error) setError(r.error);
            });
          }}
        >
          Aceptar
        </button>
        <button
          type="button"
          className="btn-ghost px-3 py-2 text-xs"
          onClick={() => {
            startTransition(async () => {
              const r = await respondFriendRequestAction(requestId, false);
              if (r?.error) setError(r.error);
            });
          }}
        >
          Rechazar
        </button>
      </div>
    );
  }

  return (
    <div className="surface p-5">
      <h2 className="font-display text-xl">Añadir amigo</h2>
      <form
        className="mt-3 flex flex-col gap-3"
        action={(fd) => {
          setError(null);
          setOk(null);
          startTransition(async () => {
            const r = await sendFriendRequestAction(fd);
            if (r?.error) setError(r.error);
            else setOk(r?.message ?? "Solicitud enviada.");
          });
        }}
      >
        <input
          className="input uppercase tracking-[0.2em]"
          name="friend_code"
          placeholder="CÓDIGO"
          required
          maxLength={8}
        />
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {ok ? <p className="text-sm text-[var(--teal)]">{ok}</p> : null}
        <SubmitButton>Enviar solicitud</SubmitButton>
      </form>
    </div>
  );
}
