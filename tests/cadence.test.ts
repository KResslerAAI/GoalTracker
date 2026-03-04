import { CheckinCadence } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isDueForWeek, nextDueDate } from "@/lib/cadence";

describe("cadence due-week logic", () => {
  const anchor = new Date("2026-01-05T00:00:00.000Z");

  it("weekly cadence is always due", () => {
    expect(
      isDueForWeek(
        {
          cadence: CheckinCadence.WEEKLY,
          anchorWeekStartDate: anchor
        },
        new Date("2026-02-02T00:00:00.000Z")
      )
    ).toBe(true);
  });

  it("biweekly cadence is due every 14 days from anchor", () => {
    const pref = {
      cadence: CheckinCadence.BIWEEKLY,
      anchorWeekStartDate: anchor
    };

    expect(isDueForWeek(pref, new Date("2026-01-19T00:00:00.000Z"))).toBe(true);
    expect(isDueForWeek(pref, new Date("2026-01-26T00:00:00.000Z"))).toBe(false);
  });

  it("computes next due date for biweekly cadence", () => {
    const pref = {
      cadence: CheckinCadence.BIWEEKLY,
      anchorWeekStartDate: anchor
    };

    const due = nextDueDate(pref, new Date("2026-01-27T00:00:00.000Z"));
    expect(due.toISOString().slice(0, 10)).toBe("2026-02-02");
  });
});
