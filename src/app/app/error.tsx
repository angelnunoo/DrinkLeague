"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="animate-rise flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-4 text-center">
      <p className="text-5xl" aria-hidden>
        ⚠️
      </p>
      <h1 className="font-display text-3xl">Ha ocurrido un error</h1>
      <p className="max-w-sm text-sm text-[var(--muted)]">
        Algo no ha ido bien. Puedes reintentar o volver al inicio.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button type="button" onClick={reset} className="btn-primary min-h-12 w-full">
          Reintentar
        </button>
        <Link href="/app" className="btn-ghost min-h-12 w-full">
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}
