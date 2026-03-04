import { ProgressType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { progressToPercent, weightedAverage, healthBand } from "@/lib/progress";

describe("progress conversions", () => {
  it("maps boolean progress", () => {
    expect(progressToPercent({ progressType: ProgressType.BOOLEAN, valueBoolean: true })).toBe(100);
    expect(progressToPercent({ progressType: ProgressType.BOOLEAN, valueBoolean: false })).toBe(0);
  });

  it("clamps percent range", () => {
    expect(progressToPercent({ progressType: ProgressType.PERCENT, valuePercent: 120 })).toBe(100);
    expect(progressToPercent({ progressType: ProgressType.PERCENT, valuePercent: -5 })).toBe(0);
  });

  it("calculates numeric against target", () => {
    expect(progressToPercent({ progressType: ProgressType.NUMERIC, valueNumeric: 30, targetValue: 60 })).toBe(50);
    expect(progressToPercent({ progressType: ProgressType.NUMERIC, valueNumeric: 120, targetValue: 60 })).toBe(100);
  });
});

describe("rollup helpers", () => {
  it("computes weighted average", () => {
    const avg = weightedAverage([
      { percent: 100, weight: 1 },
      { percent: 50, weight: 2 }
    ]);

    expect(avg).toBeCloseTo(66.67, 1);
  });

  it("assigns health bands", () => {
    expect(healthBand(85)).toBe("green");
    expect(healthBand(60)).toBe("yellow");
    expect(healthBand(10)).toBe("red");
  });
});
