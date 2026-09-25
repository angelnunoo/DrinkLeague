"use client";

import { useState, useTransition } from "react";
import { rotateLeagueInviteAction } from "@/app/actions";

export function LeagueInviteShare({
  leagueName,
  code,
  inviteUrl,
  canRotate = false,
  leagueId,
}: {
  leagueName: string;
  code: string;
  inviteUrl: string;
  canRotate?: boolean;
  leagueId?: string;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shareText = `Únete a mi liga "${leagueName}" en DrinkLeague 🍺\nCódigo: ${code}\n${inviteUrl}`;

  async function copy(text: string, kind: "link" | "code") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setMsg("No se pudo copiar. Copia el enlace a mano.");
    }
  }

  async function nativeShare() {
    if (!navigator.share) {
      await copy(shareText, "link");
      return;
    }
    try {
      await navigator.share({
        title: `DrinkLeague · ${leagueName}`,
        text: `Únete a mi liga "${leagueName}" en DrinkLeague 🍺\nCódigo: ${code}`,
        url: inviteUrl,
      });
    } catch {
      /* user cancelled */
    }
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="surface space-y-4 p-4">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Invitar amigos</p>
        <h2 className="font-display text-xl">Comparte tu liga</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enlace único. Quien lo abra entra a <span className="text-[var(--ink)]">{leagueName}</span>.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[rgba(7,16,14,0.45)] px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Código</p>
        <p className="font-display text-3xl tracking-[0.28em] text-[var(--amber)]">{code}</p>
        <p className="mt-2 break-all text-xs text-[var(--teal)]">{inviteUrl}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-center text-sm"
        >
          WhatsApp
        </a>
        <button type="button" onClick={() => void nativeShare()} className="btn-ghost text-sm">
          Compartir…
        </button>
        <button type="button" onClick={() => void copy(inviteUrl, "link")} className="btn-ghost text-sm">
          {copied === "link" ? "Enlace copiado" : "Copiar enlace"}
        </button>
        <button type="button" onClick={() => void copy(code, "code")} className="btn-ghost text-sm">
          {copied === "code" ? "Código copiado" : "Copiar código"}
        </button>
      </div>

      {canRotate && leagueId ? (
        <button
          type="button"
          disabled={pending}
          className="w-full text-xs text-[var(--muted)] underline-offset-2 hover:underline disabled:opacity-50"
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              const r = await rotateLeagueInviteAction(leagueId);
              if (r?.error) setMsg(r.error);
            });
          }}
        >
          {pending ? "Regenerando…" : "Regenerar enlace (invalida el anterior)"}
        </button>
      ) : null}

      {msg ? <p className="text-sm text-[var(--danger)]">{msg}</p> : null}
    </div>
  );
}
