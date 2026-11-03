/**
 * The settings search matcher: pure, no I/O, runs in the browser on the compact index the
 * server sends (labels and keywords only, never household data).
 *
 * Case- and accent-insensitive (Latin accents only: Devanagari and Arabic marks carry meaning),
 * prefix and word-start matches, one typo allowed in words of four letters or more, and the
 * person's language first with English as the fallback. Ranking: exact label > label prefix >
 * label word-start > keyword > description > typo.
 */

export type SearchItem = {
  id: string;
  /** The label in the person's language. */
  label: string;
  /** Parent labels, outermost first: "Assistant & voice › Voice". */
  crumbs: string[];
  /** Synonyms in the person's language, separated by commas. */
  keywords: string;
  description?: string;
  href: string;
  /** English fallbacks, so an English word finds the setting in any language. */
  labelEn?: string;
  keywordsEn?: string;
};

export type SearchHit = { item: SearchItem; score: number };

/** Lower-case and drop Latin combining accents (U+0300–U+036F). */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC").toLowerCase();
}

export function words(text: string): string[] {
  return fold(text).split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
}

/** True when `a` and `b` differ by at most one insertion, deletion, substitution or adjacent swap. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

type Compiled = { item: SearchItem; label: string; labelWords: string[]; keywordPhrases: string[]; keywordWords: string[]; descWords: string[]; crumbWords: string[]; labelEn: string; labelEnWords: string[]; keywordEnWords: string[] };

function compile(item: SearchItem): Compiled {
  const keywordPhrases = fold(item.keywords).split(",").map((p) => p.trim()).filter(Boolean);
  return {
    item,
    label: fold(item.label),
    labelWords: words(item.label),
    keywordPhrases,
    keywordWords: words(item.keywords),
    descWords: words(item.description ?? ""),
    crumbWords: item.crumbs.flatMap(words),
    labelEn: fold(item.labelEn ?? ""),
    labelEnWords: words(item.labelEn ?? ""),
    keywordEnWords: words(item.keywordsEn ?? ""),
  };
}

const startsWithWord = (list: string[], term: string) => list.some((w) => w.startsWith(term));
const typo = (list: string[], term: string) => term.length >= 4 && list.some((w) => w.length >= 4 && (withinOneEdit(w, term) || (w.length > term.length && withinOneEdit(w.slice(0, term.length), term))));

/** What one typed word is worth against one setting; 0 when it matches nothing. */
function termScore(c: Compiled, term: string): number {
  if (c.labelWords.includes(term)) return 80;
  if (startsWithWord(c.labelWords, term)) return 70;
  if (c.keywordWords.includes(term)) return 60;
  if (startsWithWord(c.keywordWords, term)) return 52;
  if (term.length >= 3 && c.label.includes(term)) return 40;
  if (c.labelEnWords.includes(term) || c.keywordEnWords.includes(term)) return 45;
  if (startsWithWord(c.labelEnWords, term) || startsWithWord(c.keywordEnWords, term)) return 38;
  if (startsWithWord(c.crumbWords, term)) return 30;
  if (startsWithWord(c.descWords, term)) return 24;
  if (typo(c.labelWords, term)) return 22;
  if (typo(c.keywordWords, term) || typo(c.labelEnWords, term) || typo(c.keywordEnWords, term)) return 18;
  if (typo(c.descWords, term)) return 8;
  return 0;
}

/** Every typed word must match; the best hits come first, ties keep the registry order. */
export function searchSettings(items: SearchItem[], query: string, limit = 30): SearchHit[] {
  const terms = words(query);
  if (terms.length === 0) return [];
  const whole = fold(query).trim();
  const hits: (SearchHit & { order: number })[] = [];
  items.forEach((item, order) => {
    const c = compile(item);
    let total = 0;
    for (const term of terms) {
      const s = termScore(c, term);
      if (s === 0) return;
      total += s;
    }
    if (c.label === whole || c.labelEn === whole) total += 100;
    else if (c.label.startsWith(whole) || c.labelEn.startsWith(whole)) total += 40;
    if (c.keywordPhrases.includes(whole)) total += 30;
    hits.push({ item, score: total / terms.length + (terms.length > 1 ? 5 * terms.length : 0), order });
  });
  return hits.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map(({ item, score }) => ({ item, score }));
}

/** Split `text` into pieces for highlighting the typed words; `hit` marks the matched pieces. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = words(query);
  if (terms.length === 0 || fold(text).length !== text.length) return [{ text, hit: false }];
  const lower = fold(text);
  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    const m = new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gu");
    for (const found of lower.matchAll(m)) for (let i = 0; i < term.length; i += 1) marked[(found.index ?? 0) + i] = true;
  }
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = out[out.length - 1];
    if (last && last.hit === marked[i]) last.text += text[i];
    else out.push({ text: text[i]!, hit: marked[i]! });
  }
  return out;
}
