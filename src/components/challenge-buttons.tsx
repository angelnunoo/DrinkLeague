"use client";

import { useTransition } from "react";
import {
  acceptChallengeAction,
  declineChallengeAction,
  settleChallengeAction,
} from "@/app/actions";

export function ChallengeButtons({
  challengeId,
  status,
  endsAt,
}: {
  challengeId: string;
  status: string;
  endsAt: string;
}) {
  const [, startTransition] = useTransition();
  const ended = new Date(endsAt).getTime() <= Date.now();

  if (status === "pending") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary px-3 py-2 text-xs"
          onClick={() => {
            startTransition(async () => {
              await acceptChallengeAction(challengeId);
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
              await declineChallengeAction(challengeId);
            });
          }}
        >
          Rechazar
        </button>
      </div>
    );
  }

  if (status === "active" && ended) {
    return (
      <button
        type="button"
        className="btn-primary px-3 py-2 text-xs"
        onClick={() => {
          startTransition(async () => {
            await settleChallengeAction(challengeId);
          });
        }}
      >
        Cerrar y ver resultado
      </button>
    );
  }

  return null;
}
