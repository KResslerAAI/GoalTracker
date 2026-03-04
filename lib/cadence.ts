import { CheckinCadence } from "@prisma/client";
import { addDays, weekStart } from "@/lib/date";

export type CadencePreference = {
  cadence: CheckinCadence;
  anchorWeekStartDate: Date;
};

export function isDueForWeek(preference: CadencePreference, candidateWeekStart: Date): boolean {
  const week = weekStart(candidateWeekStart);
  const anchor = weekStart(preference.anchorWeekStartDate);

  if (preference.cadence === CheckinCadence.WEEKLY) {
    return true;
  }

  const diffMs = week.getTime() - anchor.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays % 14 === 0;
}

export function nextDueDate(preference: CadencePreference, fromDate: Date): Date {
  const fromWeek = weekStart(fromDate);

  if (preference.cadence === CheckinCadence.WEEKLY) {
    return fromWeek;
  }

  if (isDueForWeek(preference, fromWeek)) {
    return fromWeek;
  }

  let cursor = fromWeek;
  for (let i = 0; i < 30; i += 1) {
    cursor = addDays(cursor, 7);
    if (isDueForWeek(preference, cursor)) {
      return cursor;
    }
  }

  return fromWeek;
}
