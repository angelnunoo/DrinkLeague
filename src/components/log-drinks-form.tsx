"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { DRINK_LABELS, DRINK_POINTS, type DrinkCode, type DrinkItemInput } from "@/lib/types";
import { pointsForItems } from "@/lib/domain";
import { logDrinksAction } from "@/app/actions";
import { SubmitButton } from "@/components/auth-form";
import { createClient } from "@/lib/supabase/client";

const CODES = Object.keys(DRINK_POINTS) as DrinkCode[];
const VENUE_PRESETS = ["Bar", "Pub", "Discoteca", "Festival", "Casa"];

type SmartVenue = {
  venue_id: string;
  display_name: string;
  use_count: number;
  is_favorite: boolean;
  last_used_at: string;
};

type ConfirmState = {
  venue: string;
  items: DrinkItemInput[];
  points: number;
};

function celebrate() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([40, 30, 60]);
    }
  } catch {
    /* ignore */
  }
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 660;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.stop(ctx.currentTime + 0.26);
    setTimeout(() => void ctx.close(), 400);
  } catch {
    /* ignore */
  }
}

export function LogDrinksForm({ mega = false }: { mega?: boolean }) {
  const [qty, setQty] = useState<Record<DrinkCode, number>>({
    tequifresa: 0,
    cerveza: 0,
    jarra: 0,
    chupito: 0,
    copa: 0,
  });
  const [venue, setVenue] = useState("");
  const [smart, setSmart] = useState<SmartVenue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data: uv } = await supabase
        .from("user_venues")
        .select("venue_id, use_count, is_favorite, last_used_at, venues(display_name)")
        .order("use_count", { ascending: false })
        .limit(12);
      if (!uv) return;
      setSmart(
        uv.map((row) => {
          const v = row.venues as unknown as { display_name: string } | null;
          return {
            venue_id: row.venue_id,
            display_name: v?.display_name ?? "Lugar",
            use_count: row.use_count,
            is_favorite: row.is_favorite,
            last_used_at: row.last_used_at,
          };
        }),
      );
    })();
  }, [confirm]);

  const items: DrinkItemInput[] = useMemo(
    () =>
      CODES.filter((c) => qty[c] > 0).map((code) => ({
        code,
        quantity: qty[code],
      })),
    [qty],
  );

  const total = pointsForItems(items);
  const q = venue.trim().toLowerCase();
  const suggestions = smart
    .filter((s) => !q || s.display_name.toLowerCase().includes(q))
    .slice(0, 6);
  const favorites = smart.filter((s) => s.is_favorite).slice(0, 4);
  const recent = [...smart]
    .sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))
    .slice(0, 4);

  function bump(code: DrinkCode, delta: number) {
    setQty((prev) => ({
      ...prev,
      [code]: Math.max(0, Math.min(50, prev[code] + delta)),
    }));
  }

  return (
    <>
      <form
        className="flex flex-col gap-4"
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const result = await logDrinksAction(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            const payload = result?.payload as ConfirmState | undefined;
            if (payload) {
              setConfirm(payload);
              celebrate();
              setQty({ tequifresa: 0, cerveza: 0, jarra: 0, chupito: 0, copa: 0 });
            }
          });
        }}
      >
        <input type="hidden" name="items" value={JSON.stringify(items)} />

        <div className="grid grid-cols-1 gap-2">
          {CODES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => bump(code, 1)}
              className="flex min-h-14 items-center justify-between rounded-2xl border border-[var(--line)] bg-[rgba(7,16,14,0.55)] px-4 py-3 text-left transition active:scale-[0.98] hover:border-[var(--teal)]"
            >
              <div>
                <p className="font-display text-lg text-[var(--ink-strong)]">{DRINK_LABELS[code]}</p>
                <p className="text-xs text-[var(--muted)]">{DRINK_POINTS[code]} pts</p>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span role="button" tabIndex={0} className="qty-btn" onClick={() => bump(code, -1)}>
                  −
                </span>
                <span className="w-8 text-center font-display text-2xl tabular-nums text-[var(--amber)]">
                  {qty[code]}
                </span>
                <span role="button" tabIndex={0} className="qty-btn" onClick={() => bump(code, 1)}>
                  +
                </span>
              </div>
            </button>
          ))}
        </div>

        <div>
          <p className="mb-2 text-sm text-[var(--muted)]">Lugar</p>
          {favorites.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {favorites.map((v) => (
                <button
                  key={`fav-${v.venue_id}`}
                  type="button"
                  className="min-h-10 rounded-full border border-[var(--amber)] px-3 py-1.5 text-xs"
                  onClick={() => setVenue(v.display_name)}
                >
                  ★ {v.display_name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mb-2 flex flex-wrap gap-2">
            {VENUE_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                className={`min-h-10 rounded-full border px-3 py-1.5 text-sm ${
                  venue === v
                    ? "border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_20%,transparent)]"
                    : "border-[var(--line)]"
                }`}
                onClick={() => setVenue(v)}
              >
                {v}
              </button>
            ))}
            {recent.map((v) => (
              <button
                key={`r-${v.venue_id}`}
                type="button"
                className="min-h-10 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)]"
                onClick={() => setVenue(v.display_name)}
              >
                {v.display_name} ·{v.use_count}
              </button>
            ))}
          </div>
          <input
            name="venue"
            required
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Escribe o elige un lugar…"
            className="input min-h-12"
            maxLength={80}
            autoComplete="off"
            list="venue-suggestions"
          />
          <datalist id="venue-suggestions">
            {suggestions.map((s) => (
              <option key={s.venue_id} value={s.display_name} />
            ))}
          </datalist>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] px-4 py-4">
          <span className="text-[var(--muted)]">Total</span>
          <span className="font-display text-3xl text-[var(--amber)]">+{total}</span>
        </div>

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

        <SubmitButton className={mega ? "mega-cta w-full !min-h-16 !text-xl" : "min-h-14 w-full text-lg"}>
          {pending
            ? "Registrando…"
            : mega
              ? `🍺 Sumar${total > 0 ? ` +${total}` : ""}`
              : `Sumar ${total > 0 ? `+${total}` : ""}`}
        </SubmitButton>

        <Link href="/app/drinks" className="text-center text-sm text-[var(--muted)] underline-offset-2 hover:underline">
          🍺 Mis consumiciones
        </Link>
      </form>

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="confirm-pop surface w-full max-w-md space-y-4 p-6 text-center">
            <p className="text-4xl">✅</p>
            <h2 className="font-display text-2xl text-[var(--ink-strong)]">
              Consumo registrado correctamente
            </h2>
            <ul className="space-y-1 text-left text-base">
              {confirm.items.map((i) => (
                <li key={i.code} className="flex justify-between rounded-xl border border-[var(--line)] px-3 py-2">
                  <span>
                    🍺 {DRINK_LABELS[i.code as DrinkCode] ?? i.code} x{i.quantity}
                  </span>
                  <span className="text-[var(--amber)]">
                    +{i.quantity * (DRINK_POINTS[i.code as DrinkCode] ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="font-display text-4xl text-[var(--amber)]">+{confirm.points} puntos</p>
            <p className="text-sm text-[var(--muted)]">📍 {confirm.venue}</p>
            <div className="flex flex-col gap-2 pt-2">
              <button type="button" className="btn-primary min-h-12 w-full" onClick={() => setConfirm(null)}>
                Seguir registrando
              </button>
              <Link href="/app/drinks" className="btn-ghost min-h-12 w-full" onClick={() => setConfirm(null)}>
                Ver historial
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
