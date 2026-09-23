/**
 * Text comparison the resolver and the matcher share — one definition of
 * "the same words", so HomeTalk and HomeSend can never disagree about whether
 * "Milk" and "Amul milk" are one thing.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "my", "our", "your", "their", "his", "her", "that", "this", "these", "those", "same",
  "of", "for", "to", "and", "on", "at", "in", "with", "some", "one", "s",
]);

/** Lowercase, apostrophes and punctuation out, whitespace collapsed. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "tomatoes" → "tomato", "batteries" → "battery", "eggs" → "egg"; words that only look plural stay put. */
export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|oes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** The meaningful words, singular, in order. */
export function tokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length > 0 && !STOPWORDS.has(word))
    .map(singular);
}

/**
 * How alike two phrases are, 0–1. One phrase wholly inside the other scores
 * high ("science exhibition" in "science exhibition model"), shared words
 * otherwise score by overlap.
 */
export function similarity(left: string, right: string): number {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  if (shared === 0) return 0;
  if (shared === a.size && shared === b.size) return 1;

  const smaller = Math.min(a.size, b.size);
  const larger = Math.max(a.size, b.size);
  if (shared === smaller) return 0.8 + 0.2 * (smaller / larger);
  return shared / (a.size + b.size - shared);
}

/** The words in `from` that `to` does not have. */
export function extraTokens(from: string, to: string): string[] {
  const other = new Set(tokens(to));
  return tokens(from).filter((word) => !other.has(word));
}

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[right.length]!;
}

/** Name closeness that forgives a typo ("Mannan" for "Manan") without confusing two short names. */
export function nameSimilarity(left: string, right: string): number {
  const a = normalizeText(left).replace(/\s+/g, "");
  const b = normalizeText(right).replace(/\s+/g, "");
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 4) return 0;
  const ratio = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return ratio >= 0.8 ? ratio : 0;
}

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/** "friday", "fri", "friday's" → 5; anything else → null. */
export function weekdayIndex(word: string): number | null {
  const clean = normalizeText(word);
  if (clean.length < 3) return null;
  const index = WEEKDAYS.findIndex((day) => day === clean || day.startsWith(clean));
  return index >= 0 ? index : null;
}

/** An ISO date (YYYY-MM-DD) for a Date or ISO string, read in the household's zone. */
export function isoDay(value: Date | string, timezone: string): string {
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : value;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Whole days between two ISO dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T12:00:00Z`).getTime()) / 86_400_000);
}
