import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getMyLeagues } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { archiveSeasonAction } from "@/app/actions";

export default async function AlbumPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;
  const leagues = await getMyLeagues();
  const supabase = await createClient();

  const { data: albums } = await supabase
    .from("season_albums")
    .select("*, leagues(name)")
    .eq("user_id", profile.id)
    .order("season_year", { ascending: false });

  const friendIds = [...new Set((albums ?? []).map((a) => a.best_friend_id).filter(Boolean))] as string[];
  const { data: friends } = friendIds.length
    ? await supabase.from("users").select("id, display_name").in("id", friendIds)
    : { data: [] };
  const fname = new Map((friends ?? []).map((f) => [f.id, f.display_name]));

  return (
    <section className="animate-rise space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Legado</p>
        <h1 className="font-display text-3xl">Álbum de temporadas</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Cada temporada queda guardada para siempre.
        </p>
      </div>

      {sp.ok ? (
        <p className="text-sm text-[var(--teal)]">Temporada archivada en el álbum.</p>
      ) : null}
      {sp.error ? (
        <p className="text-sm text-[var(--danger)]">{decodeURIComponent(sp.error)}</p>
      ) : null}

      {leagues[0] ? (
        <form action={archiveSeasonAction.bind(null, leagues[0].id)}>
          <button type="submit" className="btn-primary text-sm">
            Archivar temporada actual · {leagues[0].name}
          </button>
        </form>
      ) : null}

      <div className="space-y-3">
        {(albums ?? []).map((a) => {
          const league = a.leagues as unknown as { name: string } | null;
          return (
            <div
              key={a.id}
              className="overflow-hidden rounded-3xl border border-[var(--line)] p-5"
              style={{
                background:
                  "linear-gradient(145deg, rgba(45,212,191,0.12), rgba(240,162,2,0.1), rgba(7,16,14,0.9))",
              }}
            >
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {league?.name ?? "Liga"}
              </p>
              <h2 className="font-display text-3xl">Temporada {a.season_year}</h2>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="Posición final" value={`#${a.final_position ?? "—"}`} />
                <Stat label="Puntos" value={String(a.points)} />
                <Stat label="MVP" value={String(a.mvp_count)} />
                <Stat
                  label="Mejor amigo"
                  value={a.best_friend_id ? fname.get(a.best_friend_id) ?? "—" : "—"}
                />
                <Stat label="Récords" value={String(a.records_count)} />
                <Stat
                  label="Medallas"
                  value={`🥇${a.medals_gold} 🥈${a.medals_silver} 🥉${a.medals_bronze}`}
                />
              </div>
            </div>
          );
        })}
        {!albums?.length ? (
          <p className="text-sm text-[var(--muted)]">
            Aún no hay temporadas archivadas. Archiva la actual para empezar la colección.
          </p>
        ) : null}
      </div>

      <Link href="/app/profile" className="text-sm text-[var(--muted)]">
        ← Perfil
      </Link>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-chip">
      <p className="text-[9px] uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 truncate font-display text-lg">{value}</p>
    </div>
  );
}
