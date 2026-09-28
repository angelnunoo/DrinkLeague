"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

type TabKey = "stats" | "trophies" | "achievements" | "chemistry" | "bets" | "games";

const TABS: { key: TabKey; label: string }[] = [
  { key: "stats", label: "Stats" },
  { key: "trophies", label: "Trofeos" },
  { key: "achievements", label: "Logros" },
  { key: "chemistry", label: "Química" },
  { key: "bets", label: "Apuestas" },
  { key: "games", label: "Juegos" },
];

export function ProfileTabs({
  panels,
}: {
  panels: Partial<Record<TabKey, ReactNode>>;
}) {
  const available = useMemo(
    () => TABS.filter((t) => panels[t.key] != null),
    [panels],
  );
  const [tab, setTab] = useState<TabKey>(available[0]?.key ?? "stats");

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {available.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`min-h-11 shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${
              tab === t.key
                ? "bg-[var(--ink)] text-[#0b1512]"
                : "border border-[var(--line)] text-[var(--muted)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-[12rem]">{panels[tab]}</div>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <Link href="/app/bets" className="surface p-4 text-center">
          <p className="font-display text-lg">Apuestas</p>
        </Link>
        <Link href="/app/games" className="surface p-4 text-center">
          <p className="font-display text-lg">Juegos</p>
        </Link>
      </div>
    </div>
  );
}
