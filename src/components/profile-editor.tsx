"use client";

import { useMemo, useState, useTransition } from "react";
import { updateProfileAction, claimBirthdayAction } from "@/app/actions";
import { SubmitButton } from "@/components/auth-form";
import { xpProgress } from "@/lib/domain";
import type { Profile } from "@/lib/types";

function parseBirthParts(birthDate: string | null | undefined): {
  day: string;
  month: string;
  year: string;
} {
  if (!birthDate) return { day: "", month: "", year: "" };
  // Expect YYYY-MM-DD (always zero-padded from our save path)
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(birthDate);
  if (!m) return { day: "", month: "", year: "" };
  return {
    year: m[1],
    month: String(Number(m[2])),
    day: String(Number(m[3])),
  };
}

function isBirthdayToday(birthDate: string | null | undefined): boolean {
  if (!birthDate) return false;
  const bd = new Date(birthDate.includes("T") ? birthDate : `${birthDate}T12:00:00`);
  if (Number.isNaN(bd.getTime())) return false;
  const now = new Date();
  return bd.getMonth() === now.getMonth() && bd.getDate() === now.getDate();
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  [1, "Enero"],
  [2, "Febrero"],
  [3, "Marzo"],
  [4, "Abril"],
  [5, "Mayo"],
  [6, "Junio"],
  [7, "Julio"],
  [8, "Agosto"],
  [9, "Septiembre"],
  [10, "Octubre"],
  [11, "Noviembre"],
  [12, "Diciembre"],
] as const;

export function ProfileEditor({ profile }: { profile: Profile }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [bdayMsg, setBdayMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const progress = xpProgress(Number(profile.xp));
  const showBirthday = isBirthdayToday(profile.birth_date);
  const initial = useMemo(() => parseBirthParts(profile.birth_date), [profile.birth_date]);
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: now - 1900 + 1 }, (_, i) => now - i);
  }, []);

  return (
    <div className="space-y-6">
      <div className="surface p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--muted)]">Nivel</p>
            <p className="font-display text-4xl">{progress.level}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {profile.xp} XP · siguiente en {progress.next}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[var(--muted)]">Fichas</p>
            <p className="font-display text-3xl text-[var(--amber)]">
              {Number(profile.token_balance ?? 0).toLocaleString("es-ES")}
            </p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className="h-full rounded-full bg-[var(--amber)]"
            style={{ width: `${progress.ratio * 100}%` }}
          />
        </div>
      </div>

      {showBirthday ? (
        <div className="surface border-[var(--amber)] p-5">
          <p className="font-display text-2xl text-[var(--amber)]">¡Feliz cumpleaños!</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Reclama +300 puntos y +300 fichas.</p>
          <form
            className="mt-3"
            action={() => {
              startTransition(async () => {
                try {
                  await claimBirthdayAction();
                } catch (e) {
                  setBdayMsg(e instanceof Error ? e.message : "Error");
                }
              });
            }}
          >
            <SubmitButton>Reclamar bonus</SubmitButton>
          </form>
          {bdayMsg ? <p className="mt-2 text-sm text-[var(--danger)]">{bdayMsg}</p> : null}
        </div>
      ) : null}

      <div className="surface p-6">
        <h2 className="font-display text-2xl">Tu perfil</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Código amigo:{" "}
          <span className="tracking-widest text-[var(--teal)]">{profile.friend_code ?? "—"}</span>
        </p>
        <form
          className="mt-4 flex flex-col gap-4"
          action={(fd) => {
            setError(null);
            setOk(false);
            startTransition(async () => {
              const result = await updateProfileAction(fd);
              if (result?.error) setError(result.error);
              else setOk(true);
            });
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Nombre</span>
            <input
              className="input"
              name="display_name"
              defaultValue={profile.display_name}
              required
              maxLength={40}
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-[var(--muted)]">Fecha de nacimiento (completa)</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Día</span>
                <select className="input" name="birth_day" defaultValue={initial.day}>
                  <option value="">—</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Mes</span>
                <select className="input" name="birth_month" defaultValue={initial.month}>
                  <option value="">—</option>
                  {MONTHS.map(([n, label]) => (
                    <option key={n} value={n}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Año</span>
                <select className="input" name="birth_year" defaultValue={initial.year}>
                  <option value="">—</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-[var(--muted)]">Días del 1 al 31 · fecha completa con año.</p>
          </fieldset>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--muted)]">Identificador interno</span>
            <input className="input opacity-70" value={profile.email} disabled readOnly />
          </label>
          {profile.role === "superadmin" || profile.role === "global_admin" ? (
            <p className="rounded-xl bg-[color-mix(in_srgb,var(--amber)_15%,transparent)] px-3 py-2 text-sm">
              Superadmin
            </p>
          ) : null}
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {ok ? <p className="text-sm text-[var(--teal)]">Perfil actualizado.</p> : null}
          <SubmitButton>Guardar</SubmitButton>
        </form>
      </div>
    </div>
  );
}
