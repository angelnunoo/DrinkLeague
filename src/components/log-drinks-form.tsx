"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
  const [ok, setOk] = useState(false);
  const [, startTransition] = useTransition();

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
  }, [ok]);

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
    <form
      className="flex flex-col gap-3"
      action={(fd) => {
        setError(null);
        setOk(false);
        startTransition(async () => {
          const result = await logDrinksAction(fd);
          if (result?.error) setError(result.error);
          else {
            setOk(true);
            setQty({ tequifresa: 0, cerveza: 0, jarra: 0, chupito: 0, copa: 0 });
          }
        });
      }}
    >
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className="grid grid-cols-1 gap-1">
        {CODES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => bump(code, 1)}
            className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[rgba(7,16,14,0.55)] px-4 py-2.5 text-left transition active:scale-[0.98] hover:border-[var(--teal)]"
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
        <p className="mb-1.5 text-sm text-[var(--muted)]">Lugar</p>
        {favorites.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {favorites.map((v) => (
              <button
                key={`fav-${v.venue_id}`}
                type="button"
                className="rounded-full border border-[var(--amber)] px-3 py-1 text-xs"
                onClick={() => setVenue(v.display_name)}
              >
                ★ {v.display_name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {VENUE_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm ${
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
              className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)]"
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
          className="input"
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

      <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] px-4 py-3">
        <span className="text-[var(--muted)]">Total</span>
        <span className="font-display text-3xl text-[var(--amber)]">+{total}</span>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {ok ? <p className="text-sm text-[var(--teal)]">¡Sumado a todas tus ligas!</p> : null}

      <SubmitButton className={mega ? "mega-cta w-full !text-xl" : "w-full text-lg"}>
        {mega ? `🍺 Sumar${total > 0 ? ` +${total}` : ""}` : `Sumar ${total > 0 ? `+${total}` : ""}`}
      </SubmitButton>
    </form>
  );
}
