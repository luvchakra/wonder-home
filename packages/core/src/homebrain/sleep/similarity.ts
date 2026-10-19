/**
 * Telling whether two things are the same thing — by words, and by meaning
 * when there are embeddings. Pure.
 */

/** "Home-cooked foods" → "home.cooked.food": the comparable form of a thing someone likes. */
export function normaliseThing(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/^(?:the|a|an|some|any)\s+/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word))
    .join(".");
}

/** "pasta and pizza", "Italian and French food" → its parts, carrying a shared last word ("food") to each. Empty for a single thing. */
export function partsOfThing(value: string): string[] {
  const parts = value.split(/\s*(?:,|&|\band\b|\bor\b)\s*/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [];
  const last = parts[parts.length - 1]!;
  const tail = last.split(/\s+/);
  // "Italian and French food": "Italian" is "Italian food", when the last part is one adjective + one noun.
  const shared = tail.length === 2 ? tail[1]! : null;
  return parts.map((part, index) => (index < parts.length - 1 && shared && part.split(/\s+/).length === 1 && /^[A-Z]/.test(part) ? `${part} ${shared}` : part));
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * b[index]!;
    na += a[index]! * a[index]!;
    nb += b[index]! * b[index]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** Word overlap between two normalised things (Jaccard), for when there are no embeddings. */
export function wordSimilarity(a: string, b: string): number {
  const left = new Set(a.split("."));
  const right = new Set(b.split("."));
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Edit distance, for a name said or typed slightly differently ("Upasna" for "Upasana"). */
export function editDistance(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[right.length]!;
}
