import Link from "next/link";
import { BrandMark } from "@/components/brand";

export default function HomePage() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 pb-16 pt-8">
      <header className="flex items-center justify-between animate-rise">
        <BrandMark size="md" />
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn-ghost text-sm">
            Entrar
          </Link>
          <Link href="/register" className="btn-primary text-sm">
            Crear cuenta
          </Link>
        </div>
      </header>

      <section className="mt-16 flex flex-1 flex-col justify-center gap-8 md:mt-24">
        <div className="max-w-2xl animate-rise">
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-[var(--ink)] md:text-7xl">
            Drink<span className="text-[var(--amber)]">League</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-[var(--muted)] md:text-xl">
            Ligas privadas con tus amigos. Registra bebidas, suma puntos y pelea la
            semana, el mes y la temporada.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 animate-rise-delay">
            <Link href="/register" className="btn-primary">
              Empezar gratis
            </Link>
            <Link href="/login" className="btn-ghost">
              Ya tengo cuenta
            </Link>
          </div>
        </div>

        <div className="surface mt-8 grid gap-6 p-6 md:grid-cols-3 animate-rise-delay">
          {[
            { t: "Ligas privadas", d: "Invita con código o enlace. Solo tu grupo." },
            { t: "Registro rápido", d: "Cantidades en taps. Local incluido." },
            { t: "Clasificación triple", d: "Semanal, mensual y temporada (2 ene)." },
          ].map((item) => (
            <div key={item.t}>
              <h2 className="font-display text-xl text-[var(--ink)]">{item.t}</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
