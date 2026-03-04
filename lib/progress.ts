import { ProgressType } from "@prisma/client";

export function progressToPercent(params: {
  progressType: ProgressType;
  valueBoolean?: boolean | null;
  valuePercent?: number | null;
  valueNumeric?: number | null;
  targetValue?: number | null;
}): number {
  const { progressType, valueBoolean, valuePercent, valueNumeric, targetValue } = params;

  if (progressType === ProgressType.BOOLEAN) {
    return valueBoolean ? 100 : 0;
  }

  if (progressType === ProgressType.PERCENT) {
    const raw = valuePercent ?? 0;
    return Math.max(0, Math.min(100, raw));
  }

  const current = valueNumeric ?? 0;
  const target = targetValue ?? 0;
  if (target <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (current / target) * 100));
}

export function weightedAverage(items: Array<{ percent: number; weight?: number | null }>): number {
  if (!items.length) {
    return 0;
  }

  const denom = items.reduce((acc, item) => acc + (item.weight ?? 1), 0);
  if (denom <= 0) {
    return 0;
  }

  const num = items.reduce((acc, item) => acc + item.percent * (item.weight ?? 1), 0);
  return num / denom;
}

export function healthBand(percent: number): "green" | "yellow" | "red" {
  if (percent >= 80) {
    return "green";
  }

  if (percent >= 50) {
    return "yellow";
  }

  return "red";
}
