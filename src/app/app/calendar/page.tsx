import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getMyLeagues } from "@/lib/data";
import { claimBirthdayAction } from "@/app/actions";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ birthday?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const sp = await searchParams;
  const leagues = await getMyLeagues();

  const supabase = await createClient();
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Monday
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const { data: opens } = await supabase
    .from("app_opens")
    .select("day")
    .eq("user_id", profile.id)
    .gte("day", weekStartStr)
    .order("day");

  const daysOpen = opens?.length ?? 0;
  const { data: weeklyReward } = await supabase
    .from("weekly_activity_rewards")
    .select("points_granted")
    .eq("user_id", profile.id)
    .eq("week_start", weekStartStr)
    .maybeSingle();

  const year = today.getFullYear();
  const { data: birthdayClaim } = await supabase
    .from("birthday_claims")
    .select("points_granted")
    .eq("user_id", profile.id)
    .eq("year", year)
    .maybeSingle();

  const leagueIds = leagues.map((l) => l.id);
  const { data: events } = leagueIds.length
    ? await supabase
        .from("calendar_events")
        .select("*")
        .in("league_id", leagueIds)
        .gte("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(20)
    : { data: [] };

  const { data: challenges } = await supabase
    .from("challenges")
    .select("id, mode, status, ends_at")
    .in("status", ["pending", "active"])
    .order("ends_at", { ascending: true })
    .limit(8);

  const isBirthday =
    profile.birth_date &&
    (() => {
      const bd = new Date(profile.birth_date + "T12:00:00");
      return bd.getUTCMonth() === today.getMonth() && bd.getUTCDate() === today.getDate();
    })();

  return (
    <section className="animate-rise space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Planificación</p>
        <h1 className="font-display text-3xl">Calendario</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Semana, eventos, cumpleaños y actividad.
        </p>
      </div>

      {sp.birthday ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--amber)_20%,transparent)] px-3 py-2 text-sm">
          Bonus de cumpleaños reclamado (+300).
        </p>
      ) : null}

      <div className="surface p-5">
        <h2 className="font-display text-2xl">Actividad semanal</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Abre la app 5 días distintos → +10 pts y fichas.
        </p>
        <div className="mt-4 flex items-end justify-between">
          <p className="font-display text-4xl text-[var(--amber)]">
            {daysOpen}
            <span className="text-lg text-[var(--muted)]">/5</span>
          </p>
          {weeklyReward ? (
            <p className="text-sm text-[var(--teal)]">
              Recompensa cobrada (+{weeklyReward.points_granted})
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {daysOpen >= 5 ? "Se otorga al abrir hoy" : "Sigue entrando"}
            </p>
          )}
        </div>
        <div className="mt-3 flex gap-1">
          {Array.from({ length: 7 }).map((_, i) => {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            const key = d.toISOString().slice(0, 10);
            const hit = (opens ?? []).some((o) => o.day === key);
            return (
              <div
                key={key}
                className={`h-8 flex-1 rounded-md ${
                  hit ? "bg-[var(--teal)]" : "bg-[var(--line)]"
                }`}
                title={key}
              />
            );
          })}
        </div>
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-2xl">Cumpleaños</h2>
        {profile.birth_date ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            Registrado: {profile.birth_date}
          </p>
        ) : (
          <p className="mt-1 text-sm text-[var(--muted)]">
            Añade tu fecha en{" "}
            <Link href="/app/profile" className="text-[var(--teal)]">
              perfil
            </Link>
            .
          </p>
        )}
        {isBirthday && !birthdayClaim ? (
          <form action={claimBirthdayAction} className="mt-3">
            <button type="submit" className="btn-primary">
              Reclamar +300 pts
            </button>
          </form>
        ) : null}
        {birthdayClaim ? (
          <p className="mt-2 text-sm text-[var(--teal)]">
            Ya reclamaste el bonus {year} (+{birthdayClaim.points_granted}).
          </p>
        ) : null}
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-2xl">Retos activos</h2>
        <ul className="mt-3 space-y-2">
          {(challenges ?? []).map((c) => (
            <li key={c.id} className="flex justify-between text-sm">
              <Link href="/app/challenges" className="capitalize hover:text-[var(--teal)]">
                {c.mode} · {c.status}
              </Link>
              <span className="text-[var(--muted)]">
                {c.ends_at ? new Date(c.ends_at).toLocaleDateString("es-ES") : "—"}
              </span>
            </li>
          ))}
          {!challenges?.length ? (
            <li className="text-sm text-[var(--muted)]">Sin retos abiertos.</li>
          ) : null}
        </ul>
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-2xl">Eventos de liga</h2>
        <ul className="mt-3 space-y-2">
          {(events ?? []).map((e) => (
            <li key={e.id} className="border-b border-[var(--line)] pb-2 text-sm">
              <p className="font-semibold">{e.title}</p>
              <p className="text-[var(--muted)]">
                {new Date(e.starts_at).toLocaleString("es-ES")} →{" "}
                {new Date(e.ends_at).toLocaleString("es-ES")}
              </p>
            </li>
          ))}
          {!events?.length ? (
            <li className="text-sm text-[var(--muted)]">No hay eventos programados.</li>
          ) : null}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/app/bets" className="surface p-4 text-center">
          <p className="font-display text-lg">DrinkBets</p>
        </Link>
        <Link href="/app/shop" className="surface p-4 text-center">
          <p className="font-display text-lg">Tienda</p>
        </Link>
      </div>
    </section>
  );
}
