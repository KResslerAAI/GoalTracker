const DAY_MS = 24 * 60 * 60 * 1000;

export function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function weeksBetween(a: Date, b: Date): number {
  const aStart = weekStart(a).getTime();
  const bStart = weekStart(b).getTime();
  return Math.floor((bStart - aStart) / (7 * DAY_MS));
}

export function sameWeek(a: Date, b: Date): boolean {
  return weekStart(a).getTime() === weekStart(b).getTime();
}
