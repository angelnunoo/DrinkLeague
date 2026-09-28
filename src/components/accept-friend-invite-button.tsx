"use client";

import { useState, useTransition } from "react";
import { sendFriendRequestAction } from "@/app/actions";

export function AcceptFriendInviteButton({ friendCode }: { friendCode: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className="btn-primary min-h-12 w-full"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const fd = new FormData();
            fd.set("friend_code", friendCode);
            const r = await sendFriendRequestAction(fd);
            if (r?.error) {
              setError(r.error);
              return;
            }
            window.location.assign("/app/social?friend_sent=1");
          });
        }}
      >
        {pending ? "Enviando…" : "Enviar solicitud"}
      </button>
      {error ? <p className="text-center text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
