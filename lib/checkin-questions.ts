export type CheckinQuestionType =
  | "short_answer"
  | "multiple_choice"
  | "single_choice"
  | "likert"
  | "ranking"
  | "text"
  | "number"
  | "boolean";

type EncodedMeta = {
  type?: CheckinQuestionType;
  options?: string[];
  rankMax?: number;
};

const META_PREFIX = " ##meta:";

export function encodeQuestionPrompt(prompt: string, meta: EncodedMeta) {
  const cleanPrompt = prompt.trim();
  const hasMeta = meta.type || (meta.options && meta.options.length) || meta.rankMax;
  if (!hasMeta) return cleanPrompt;
  return `${cleanPrompt}${META_PREFIX}${JSON.stringify(meta)}`;
}

export function decodeQuestionPrompt(prompt: string) {
  const index = prompt.indexOf(META_PREFIX);
  if (index === -1) {
    return { prompt, meta: {} as EncodedMeta };
  }
  const text = prompt.slice(0, index).trim();
  const raw = prompt.slice(index + META_PREFIX.length).trim();
  try {
    const meta = JSON.parse(raw) as EncodedMeta;
    return { prompt: text, meta };
  } catch {
    return { prompt, meta: {} as EncodedMeta };
  }
}
