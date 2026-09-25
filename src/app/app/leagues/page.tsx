import Link from "next/link";
import { getMyLeagues } from "@/lib/data";

export default async function LeaguesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ left?: string; error?: string }>;
}) {
  const leagues = await getMyLeagues();
  const sp = await searchParams;

  return (
    <section className="animate-rise">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Ligas</h1>
          <p className="mt-1 text-[var(--muted)]">Tus campos de batalla.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/join" className="btn-ghost text-sm">
            Unirme
          </Link>
          <Link href="/app/leagues/new" className="btn-primary text-sm">
            Crear
          </Link>
        </div>
      </div>

      {sp.left ? (
        <p className="mt-4 rounded-xl bg-[color-mix(in_srgb,var(--teal)_15%,transparent)] px-3 py-2 text-sm text-[var(--teal)]">
          Has abandonado la liga.
        </p>
      ) : null}
      {sp.error ? (
        <p className="mt-4 rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
          {sp.error}
        </p>
      ) : null}

      {leagues.length === 0 ? (
        <div className="surface mt-8 p-8 text-center">
          <p className="font-display text-2xl">Sin ligas todavía</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Crea una y comparte el enlace por WhatsApp, o únete con un código.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/app/leagues/new" className="btn-primary">
              Crear liga
            </Link>
            <Link href="/app/join" className="btn-ghost">
              Unirme
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {leagues.map((league) => (
            <li key={league.id}>
              <Link
                href={`/app/leagues/${league.id}`}
                className="surface flex items-center justify-between gap-3 p-5 transition hover:border-[var(--teal)]"
              >
                <div>
                  <p className="font-display text-xl">{league.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {league.membership_role === "league_admin" ? "Capitán · " : ""}
                    Invita desde la liga · {league.timezone}
                  </p>
                </div>
                <span className="text-[var(--amber)]">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
