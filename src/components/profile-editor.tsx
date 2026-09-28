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

const AVATARS = ["🍺", "🃏", "👑", "🐎", "🎱", "🎰", "⚔️", "🔥", "😎", "🦊", "🐺", "🐉"];
const BANNERS: Array<{ id: string; label: string; css: string }> = [
  {
    id: "banner:casino",
    label: "Casino",
    css: "linear-gradient(135deg,#1a1208,#3a2208 40%,#0b1512)",
  },
  {
    id: "banner:teal",
    label: "Teal",
    css: "linear-gradient(135deg,#0b1512,#134e4a 50%,#0f172a)",
  },
  {
    id: "banner:night",
    label: "Noche",
    css: "linear-gradient(135deg,#0f172a,#1e1b4b 55%,#0b1512)",
  },
  {
    id: "banner:ember",
    label: "Ember",
    css: "linear-gradient(135deg,#1c0a0a,#7c2d12 45%,#0b1512)",
  },
  {
    id: "banner:gold",
    label: "Oro",
    css: "linear-gradient(135deg,#2a1a00,#854d0e 40%,#0b1512)",
  },
  {
    id: "banner:forest",
    label: "Bosque",
    css: "linear-gradient(135deg,#052e16,#14532d 50%,#0b1512)",
  },
];
const FRAMES = [
  { id: "gold", label: "Oro", className: "frame-gold" },
  { id: "teal", label: "Teal", className: "frame-teal" },
  { id: "rose", label: "Rosa", className: "frame-rose" },
  { id: "none", label: "Ninguno", className: "" },
];
const BACKGROUNDS = [
  { id: "default", label: "Clásico" },
  { id: "felt", label: "Fieltro" },
  { id: "neon", label: "Neón" },
  { id: "velvet", label: "Terciopelo" },
];

function avatarValue(url: string | null | undefined): string {
  if (url?.startsWith("emoji:")) return url.slice(6);
  return "";
}

export function ProfileEditor({
  profile,
  titles,
}: {
  profile: Profile;
  titles?: Array<{ code: string; name: string; emoji: string }>;
}) {
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

  const cosmetics = profile.equipped_cosmetics ?? {};
  const [avatar, setAvatar] = useState(
    avatarValue(profile.avatar_url) || AVATARS[0],
  );
  const [banner, setBanner] = useState(profile.banner_url || BANNERS[0].id);
  const [frame, setFrame] = useState(cosmetics.frame || "gold");
  const [bg, setBg] = useState(cosmetics.bg || "default");
  const [titleCode, setTitleCode] = useState(profile.equipped_title_code || "");

  const bannerCss =
    BANNERS.find((b) => b.id === banner)?.css ??
    (banner.startsWith("http") ? `center/cover url(${banner})` : BANNERS[0].css);
  const frameClass = FRAMES.find((f) => f.id === frame)?.className ?? "";

  return (
    <div className="space-y-6" data-profile-bg={bg}>
      <div className="profile-banner">
        <div className="profile-banner-inner" style={{ background: bannerCss }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,16,14,0.92)] via-transparent to-transparent" />
        <div className="relative flex items-end gap-4 p-5 pt-14">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[var(--amber)] bg-[rgba(7,16,14,0.85)] font-display text-3xl ${frameClass}`}
          >
            {avatar}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--amber)]">
              {profile.title ?? "Novato"}
            </p>
            <p className="truncate font-display text-2xl">{profile.display_name}</p>
            <p className="text-xs text-[var(--muted)]">
              Nv.{progress.level} · {Number(profile.token_balance ?? 0).toLocaleString("es-ES")} ★
            </p>
          </div>
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

      <div className="surface p-5">
        <h2 className="font-display text-2xl">Editar perfil</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Avatar, banner, título y cosméticos en una sola pantalla.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Código amigo:{" "}
          <span className="tracking-widest text-[var(--teal)]">{profile.friend_code ?? "—"}</span>
        </p>

        <form
          className="mt-4 flex flex-col gap-5"
          action={(fd) => {
            setError(null);
            setOk(false);
            fd.set("avatar_url", `emoji:${avatar}`);
            fd.set("banner_url", banner);
            fd.set("frame", frame);
            fd.set("bg", bg);
            if (titleCode) fd.set("equipped_title_code", titleCode);
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

          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">Avatar</p>
            <div className="profile-edit-grid">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`profile-swatch bg-[rgba(7,16,14,0.7)] ${
                    avatar === a ? "profile-swatch-active" : "border-[var(--line)]"
                  }`}
                  onClick={() => setAvatar(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">Banner</p>
            <div className="grid grid-cols-3 gap-2">
              {BANNERS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`min-h-14 rounded-xl border-2 text-[10px] font-semibold ${
                    banner === b.id ? "border-[var(--amber)]" : "border-transparent"
                  }`}
                  style={{ background: b.css }}
                  onClick={() => setBanner(b.id)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">Marco</p>
            <div className="grid grid-cols-4 gap-2">
              {FRAMES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`min-h-11 rounded-xl border text-xs font-semibold ${
                    frame === f.id
                      ? "border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_12%,transparent)]"
                      : "border-[var(--line)]"
                  }`}
                  onClick={() => setFrame(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">Fondo</p>
            <div className="grid grid-cols-4 gap-2">
              {BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`min-h-11 rounded-xl border text-xs font-semibold ${
                    bg === b.id
                      ? "border-[var(--teal)] bg-[color-mix(in_srgb,var(--teal)_12%,transparent)]"
                      : "border-[var(--line)]"
                  }`}
                  onClick={() => setBg(b.id)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {(titles ?? []).length > 0 ? (
            <label className="flex flex-col gap-2">
              <span className="text-sm text-[var(--muted)]">Título activo</span>
              <select
                className="input min-h-12"
                value={titleCode}
                onChange={(e) => setTitleCode(e.target.value)}
              >
                <option value="">Mantener actual</option>
                {titles!.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.emoji} {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-[var(--muted)]">Fecha de nacimiento</legend>
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
          </fieldset>

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {ok ? <p className="text-sm text-[var(--teal)]">Perfil actualizado.</p> : null}
          <SubmitButton>Guardar perfil</SubmitButton>
        </form>
      </div>
    </div>
  );
}
