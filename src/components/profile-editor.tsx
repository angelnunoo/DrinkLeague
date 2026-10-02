"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

const BANNER_ALIASES: Record<string, string> = {
  banner_night: "banner:night",
  banner_premium_bar: "banner:casino",
  banner_weekend_party: "banner:ember",
  banner_rare_storm: "banner:teal",
  banner_founder: "banner:gold",
};

function normalizeBannerId(raw: string | null | undefined): string {
  if (!raw) return BANNERS[0].id;
  return BANNER_ALIASES[raw] ?? raw;
}

function normalizeFrameId(raw: string | null | undefined): string {
  if (!raw) return "gold";
  if (raw === "teal" || raw.includes("teal")) return "teal";
  if (raw === "rose" || raw.includes("rose") || raw.includes("fire")) return "rose";
  if (raw === "none") return "none";
  return "gold";
}

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
  const router = useRouter();
  const progress = xpProgress(Number(profile.xp));
  const showBirthday = isBirthdayToday(profile.birth_date);
  const initial = parseBirthParts(profile.birth_date);
  const nowYear = new Date().getFullYear();
  const years = Array.from({ length: nowYear - 1900 + 1 }, (_, i) => nowYear - i);

  const cosmetics = profile.equipped_cosmetics ?? {};
  const [avatar, setAvatar] = useState(
    avatarValue(profile.avatar_url) || AVATARS[0],
  );
  const [banner, setBanner] = useState(normalizeBannerId(profile.banner_url));
  const [frame, setFrame] = useState(normalizeFrameId(cosmetics.frame));
  const [bg, setBg] = useState(cosmetics.bg || "default");
  const [titleCode, setTitleCode] = useState(profile.equipped_title_code || "");
  const [displayName, setDisplayName] = useState(profile.display_name);

  useEffect(() => {
    setAvatar(avatarValue(profile.avatar_url) || AVATARS[0]);
    setBanner(normalizeBannerId(profile.banner_url));
    setFrame(normalizeFrameId(profile.equipped_cosmetics?.frame));
    setBg(profile.equipped_cosmetics?.bg || "default");
    setTitleCode(profile.equipped_title_code || "");
    setDisplayName(profile.display_name);
  }, [
    profile.avatar_url,
    profile.banner_url,
    profile.display_name,
    profile.equipped_title_code,
    profile.equipped_cosmetics?.frame,
    profile.equipped_cosmetics?.bg,
  ]);

  const bannerCss =
    BANNERS.find((b) => b.id === banner)?.css ??
    (banner.startsWith("http") ? `center/cover url(${banner})` : BANNERS[0].css);
  const frameClass = FRAMES.find((f) => f.id === frame)?.className ?? "";
  const activeTitle =
    titles?.find((t) => t.code === titleCode)?.name ?? profile.title ?? "Novato";

  return (
    <div className="space-y-4" data-profile-bg={bg}>
      {showBirthday ? (
        <div className="premium-banner p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
            Cumpleaños
          </p>
          <p className="mt-1 font-display text-2xl text-[var(--amber)]">¡Feliz cumpleaños!</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Reclama +300 puntos y +300 fichas.
          </p>
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

      <div className="profile-editor-panel">
        <div className="profile-banner !rounded-none !border-0">
          <div className="profile-banner-inner" style={{ background: bannerCss }} />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,16,14,0.95)] via-[rgba(7,16,14,0.35)] to-transparent" />
          <div className="relative flex items-end gap-4 p-5 pt-14">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[var(--amber)] bg-[rgba(7,16,14,0.85)] font-display text-3xl ${frameClass}`}
            >
              {avatar}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--amber)]">
                {activeTitle}
              </p>
              <p className="truncate font-display text-2xl">{displayName}</p>
              <p className="text-xs text-[var(--muted)]">
                Nv.{progress.level} ·{" "}
                {Number(profile.token_balance ?? 0).toLocaleString("es-ES")} ★
              </p>
            </div>
          </div>
        </div>

        <form
          className="flex flex-col"
          action={async (fd) => {
            setError(null);
            setOk(false);
            fd.set("avatar_url", `emoji:${avatar}`);
            fd.set("banner_url", banner);
            fd.set("frame", frame);
            fd.set("bg", bg);
            if (titleCode) fd.set("equipped_title_code", titleCode);
            const result = await updateProfileAction(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            const nextName = String(fd.get("display_name") ?? "").trim();
            if (nextName) setDisplayName(nextName);
            setOk(true);
            router.refresh();
          }}
        >
          <div className="profile-editor-section">
            <p className="profile-section-label">Identidad</p>
            <h2 className="mt-1 font-display text-2xl">Personalizar</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Avatar, banner y cosméticos. Vista previa en vivo arriba.
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Código amigo:{" "}
              <span className="tracking-widest text-[var(--teal)]">
                {profile.friend_code ?? "—"}
              </span>
            </p>

            <label className="mt-4 flex flex-col gap-2">
              <span className="text-sm text-[var(--muted)]">Nombre</span>
              <input
                className="input"
                name="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={40}
              />
            </label>
          </div>

          <div className="profile-editor-section">
            <p className="profile-section-label mb-3">Avatar</p>
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

          <div className="profile-editor-section">
            <p className="profile-section-label mb-3">Banner</p>
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

          <div className="profile-editor-section">
            <p className="profile-section-label mb-3">Marco</p>
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

          <div className="profile-editor-section">
            <p className="profile-section-label mb-3">Fondo</p>
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
            <div className="profile-editor-section">
              <p className="profile-section-label mb-3">Título activo</p>
              <div className="flex flex-wrap gap-2">
                {titles!.map((t) => (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => setTitleCode(t.code)}
                    className={`rounded-2xl border px-3 py-2 text-sm ${
                      titleCode === t.code
                        ? "border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_12%,transparent)]"
                        : "border-[var(--line)]"
                    }`}
                  >
                    {t.emoji} {t.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="profile-editor-section">
            <fieldset className="flex flex-col gap-2">
              <legend className="profile-section-label">Fecha de nacimiento</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    Día
                  </span>
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
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    Mes
                  </span>
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
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    Año
                  </span>
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
          </div>

          <div className="profile-editor-section space-y-3">
            {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
            {ok ? <p className="text-sm text-[var(--teal)]">Perfil actualizado.</p> : null}
            <SubmitButton>Guardar perfil</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
