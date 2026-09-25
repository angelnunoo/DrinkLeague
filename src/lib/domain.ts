import { DRINK_POINTS, type DrinkItemInput } from "@/lib/types";

const LEVEL_THRESHOLDS = [0, 50, 120, 220, 350, 520, 740, 1000, 1350, 1800] as const;

export function pointsForItems(items: DrinkItemInput[]): number {
  return items.reduce((sum, item) => {
    if (item.quantity < 1) return sum;
    return sum + item.quantity * DRINK_POINTS[item.code];
  }, 0);
}

export function levelForXp(xp: number): number {
  if (xp < 1800) {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i -= 1) {
      if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
    }
    return 1;
  }

  let level = 10;
  while (level < 100) {
    const needNext = Math.floor(1800 * 1.25 ** (level + 1 - 10));
    if (xp < needNext) return level;
    level += 1;
  }
  return 100;
}

export function xpProgress(xp: number): { level: number; current: number; next: number; ratio: number } {
  const level = levelForXp(xp);
  const currentThreshold =
    level <= 10
      ? LEVEL_THRESHOLDS[level - 1]
      : Math.floor(1800 * 1.25 ** (level - 10));
  const nextThreshold =
    level < 10
      ? LEVEL_THRESHOLDS[level]
      : Math.floor(1800 * 1.25 ** (level + 1 - 10));
  const span = Math.max(nextThreshold - currentThreshold, 1);
  const ratio = Math.min(1, Math.max(0, (xp - currentThreshold) / span));
  return { level, current: currentThreshold, next: nextThreshold, ratio };
}

/** Season year = year of the Jan 2 start (boundary belongs to new season). */
export function seasonYearFor(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  if (month > 1 || (month === 1 && day >= 2)) return year;
  return year - 1;
}

export function formatInviteLink(code: string, origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/join/${encodeURIComponent(code)}`;
}

function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}
