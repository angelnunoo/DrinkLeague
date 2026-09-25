"use client";

import { useState, useTransition } from "react";
import { claimPrestigeAction } from "@/app/actions";

export function PrestigeButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        className="btn-primary w-full"
        onClick={() => {
          setMsg(null);
          setErr(null);
          startTransition(async () => {
            const r = await claimPrestigeAction();
            if (r?.error) setErr(r.error);
            else setMsg(r?.message ?? "Prestigio alcanzado.");
          });
        }}
      >
        👑 Ascender de Prestigio
      </button>
      {msg ? <p className="mt-2 text-sm text-[var(--teal)]">{msg}</p> : null}
      {err ? <p className="mt-2 text-sm text-[var(--danger)]">{err}</p> : null}
    </div>
  );
}
