import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getMyLeagues } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { detectNightAction, awardMvpsAction, generateDigestAction } from "@/app/actions";

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ night?: string; league?: string; error?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;
  const leagues = await getMyLeagues();
  const leagueId = sp.league || leagues[0]?.id;

  const supabase = await createClient();
  const [{ data: globalRecords }, { data: leagueRecords }, { data: nights }, { data: mvps }] =
    await Promise.all([
      supabase.from("global_records").select("*").order("value", { ascending: false }).limit(20),
      leagueId
        ? supabase
            .from("league_records")
            .select("*")
            .eq("league_id", leagueId)
            .order("value", { ascending: false })
        : Promise.resolve({ data: [] }),
      leagueId
        ? supabase
            .from("historic_nights")
            .select("*")
            .eq("league_id", leagueId)
            .order("night_date", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
      leagueId
        ? supabase
            .from("mvp_awards")
            .select("*, users:user_id(display_name)")
            .eq("league_id", leagueId)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);

  const holderIds = [
    ...new Set(
      [...(globalRecords ?? []), ...(leagueRecords ?? [])]
        .map((r) => r.holder_user_id)
        .filter(Boolean) as string[],
    ),
  ];
  const { data: holders } = holderIds.length
    ? await supabase.from("users").select("id, display_name").in("id", holderIds)
    : { data: [] };
  const hmap = new Map((holders ?? []).map((h) => [h.id, h.display_name]));

  return (
    <section className="animate-rise space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Legado</p>
        <h1 className="font-display text-3xl">Libro de récords</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Global, liga, noches históricas y MVPs.</p>
      </div>

      {sp.night ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--amber)_15%,transparent)] px-3 py-2 text-sm">
          Noche histórica evaluada.
        </p>
      ) : null}
      {sp.error ? <p className="text-sm text-[var(--danger)]">{sp.error}</p> : null}

      {leagues.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {leagues.map((l) => (
            <Link
              key={l.id}
              href={`/app/records?league=${l.id}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                leagueId === l.id
                  ? "bg-[var(--ink)] text-[#0b1512]"
                  : "border border-[var(--line)] text-[var(--muted)]"
              }`}
            >
              {l.name}
            </Link>
          ))}
        </div>
      ) : null}

      {leagueId ? (
        <div className="flex flex-wrap gap-2">
          <form action={detectNightAction.bind(null, leagueId)}>
            <button type="submit" className="btn-ghost text-xs">
              Detectar noche histórica
            </button>
          </form>
          <form action={awardMvpsAction.bind(null, leagueId)}>
            <button type="submit" className="btn-ghost text-xs">
              Otorgar MVPs semanales
            </button>
          </form>
          <form action={generateDigestAction.bind(null, leagueId)}>
            <button type="submit" className="btn-ghost text-xs">
              Generar digest IA
            </button>
          </form>
        </div>
      ) : null}

      <div className="surface p-5">
        <h2 className="font-display text-2xl">Récords globales</h2>
        <ul className="mt-3 space-y-2">
          {(globalRecords ?? []).map((r) => (
            <li key={r.record_code} className="flex justify-between text-sm">
              <span>{r.label}</span>
              <span className="text-[var(--amber)]">
                {Number(r.value)} · {hmap.get(r.holder_user_id) ?? "—"}
              </span>
            </li>
          ))}
          {!globalRecords?.length ? (
            <li className="text-sm text-[var(--muted)]">Sin récords globales aún.</li>
          ) : null}
        </ul>
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-2xl">Récords de liga</h2>
        <ul className="mt-3 space-y-2">
          {(leagueRecords ?? []).map((r) => (
            <li key={r.id} className="flex justify-between text-sm">
              <span>{r.label}</span>
              <span className="text-[var(--amber)]">
                {Number(r.value)} · {hmap.get(r.holder_user_id) ?? "—"}
              </span>
            </li>
          ))}
          {!leagueRecords?.length ? (
            <li className="text-sm text-[var(--muted)]">Sin récords de liga.</li>
          ) : null}
        </ul>
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-2xl">MVPs</h2>
        <ul className="mt-3 space-y-2">
          {(mvps ?? []).map((m) => {
            const u = m.users as unknown as { display_name: string } | null;
            return (
              <li key={m.id} className="flex justify-between text-sm">
                <span className="capitalize">
                  {m.category} · {m.period_type} {m.period_key}
                </span>
                <span>
                  {u?.display_name ?? "?"} · {m.points}
                </span>
              </li>
            );
          })}
          {!mvps?.length ? <li className="text-sm text-[var(--muted)]">Sin MVPs.</li> : null}
        </ul>
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-2xl">Noches históricas</h2>
        <ul className="mt-3 space-y-3">
          {(nights ?? []).map((n) => (
            <li key={n.id} className="border-b border-[var(--line)] pb-2">
              <p className="font-semibold">{n.title}</p>
              <p className="text-xs text-[var(--muted)]">
                {n.night_date} · {JSON.stringify(n.stats)}
              </p>
            </li>
          ))}
          {!nights?.length ? (
            <li className="text-sm text-[var(--muted)]">Ninguna noche marcada aún.</li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
