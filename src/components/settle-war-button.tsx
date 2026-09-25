"use client";

import { useTransition } from "react";
import { settleWarAction } from "@/app/actions";

export function SettleWarButton({
  warId,
  endsAt,
  status,
}: {
  warId: string;
  endsAt: string;
  status: string;
}) {
  const [, startTransition] = useTransition();
  const ended = new Date(endsAt).getTime() <= Date.now();
  if (status === "completed" || !ended) return null;

  return (
    <button
      type="button"
      className="btn-primary px-3 py-2 text-xs"
      onClick={() => {
        startTransition(async () => {
          await settleWarAction(warId);
        });
      }}
    >
      Cerrar guerra
    </button>
  );
}
