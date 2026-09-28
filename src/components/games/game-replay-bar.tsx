"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { startGameAction } from "@/app/actions";

export function GameReplayBar({
  gameType,
  exitHref = "/app/games",
  extras,
  label = "🔄 Jugar otra vez",
}: {
  gameType: "peaje" | "rey" | "duelo";
  exitHref?: string;
  extras?: Record<string, string>;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function playAgain() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("game_type", gameType);
      if (extras) {
        for (const [k, v] of Object.entries(extras)) {
          if (v) fd.set(k, v);
        }
      }
      const r = await startGameAction(fd);
      if (r?.error) {
        window.alert(r.error);
        return;
      }
      const nextId = (r?.payload as { sessionId?: string } | undefined)?.sessionId;
      if (!nextId) {
        window.alert("No se pudo abrir otra partida.");
        return;
      }
      window.location.assign(`/app/games/play?id=${encodeURIComponent(nextId)}`);
    });
  }

  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={playAgain}
        className="mega-cta !min-h-14 !text-base"
      >
        {pending ? "…" : label}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => router.push(exitHref)}
        className="btn-primary min-h-14 text-base"
      >
        🚪 Salir
      </button>
    </div>
  );
}
