"use client";

import { useState, type ReactNode } from "react";

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
  const available = TABS.filter((t) => panels[t.key] != null);
  const [tab, setTab] = useState<TabKey>(available[0]?.key ?? "stats");

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {available.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`profile-tab ${tab === t.key ? "is-active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-[12rem] animate-rise">{panels[tab]}</div>
    </div>
  );
}
