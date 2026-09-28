"use client";

import { useState } from "react";

export function FriendInviteShare({
  displayName,
  friendCode,
  inviteUrl,
}: {
  displayName: string;
  friendCode: string;
  inviteUrl: string;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const shareText = `¡Añádeme en DrinkLeague! 🍺\nSoy ${displayName}\nCódigo amigo: ${friendCode}\n${inviteUrl}`;

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
        title: `DrinkLeague · Amigos`,
        text: `¡Añádeme en DrinkLeague! 🍺 Soy ${displayName}. Código: ${friendCode}`,
        url: inviteUrl,
      });
    } catch {
      /* cancelled */
    }
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="surface space-y-4 p-4">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Amigos</p>
        <h2 className="font-display text-xl">Invitar por WhatsApp</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Comparte tu código. Quien abra el enlace te puede enviar solicitud de amistad.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[rgba(7,16,14,0.45)] px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Tu código amigo</p>
        <p className="font-display text-3xl tracking-[0.28em] text-[var(--amber)]">{friendCode}</p>
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
        <button type="button" onClick={() => void copy(friendCode, "code")} className="btn-ghost text-sm">
          {copied === "code" ? "Código copiado" : "Copiar código"}
        </button>
      </div>

      {msg ? <p className="text-sm text-[var(--danger)]">{msg}</p> : null}
    </div>
  );
}
