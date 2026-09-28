import Link from "next/link";

export default function AppNotFound() {
  return (
    <section className="animate-rise flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-4 text-center">
      <p className="text-5xl" aria-hidden>
        ⚠️
      </p>
      <h1 className="font-display text-3xl">Página no encontrada</h1>
      <p className="max-w-sm text-sm text-[var(--muted)]">
        Esa ruta no existe. Usa el menú inferior.
      </p>
      <Link href="/app/games" className="btn-ghost min-h-12 px-8">
        ← Juegos
      </Link>
    </section>
  );
}
