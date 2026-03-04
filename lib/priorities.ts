const MAX_PRIORITIES = 5;

type StoredPriorities = {
  priorities: string[];
};

export function encodePrioritiesAnswer(priorities: string[]) {
  const cleaned = priorities
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_PRIORITIES);
  return JSON.stringify({ priorities: cleaned } satisfies StoredPriorities);
}

export function decodePrioritiesAnswer(raw: string | null | undefined) {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as Partial<StoredPriorities>;
    if (Array.isArray(parsed.priorities)) {
      return parsed.priorities
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, MAX_PRIORITIES);
    }
  } catch {
    // Fall through to legacy parsing.
  }

  const normalized = trimmed.replace(/\r/g, "");
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
  const candidates = lines.length > 1 ? lines : normalized.split(",").map((item) => item.trim()).filter(Boolean);
  return candidates.slice(0, MAX_PRIORITIES);
}
