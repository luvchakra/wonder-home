import { inferRate, type Consumable, type EvidenceBasis, type Purchase } from "./consumables";

/**
 * A receipt becomes purchase history (story 09-009).
 *
 * A paid receipt asks nothing to be paid, so it is never a bill; what it is,
 * is evidence — the thing `inferRate` has always needed and never had a
 * source for. Each line a person confirms becomes one `consumable_purchases`
 * row, and the consumable it belongs to learns from it: when it was last
 * bought, how much, and — once there are enough purchases to average — how
 * long one lasts. Nothing here writes; it decides what a line is and what the
 * history now says, so the repository and the tests read the same rules.
 */

export type ReceiptLine = {
  /** The line as printed ("Amul Toned Milk 1L"). */
  name: string;
  quantity: number | null;
  unit: string | null;
  /** What the line cost in total, in the currency's major unit (42.50). */
  lineTotal: number | null;
};

/** Words on a receipt line that describe a pack, not the thing. */
const NOISE = new Set(["pack", "pkt", "packet", "pc", "pcs", "piece", "pieces", "x", "of", "the", "a", "an", "and", "fresh", "loose", "value"]);
const MEASURE = /^(?:x\d+|\d+(?:[.,]\d+)?(?:kg|g|gm|gms|l|ltr|ml|pc|pcs|x)?)$/i;

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && /(?:ch|sh|ss|x|o)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** The words that name the thing: lower-case, singular, with sizes and pack words dropped. */
export function itemWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.,]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !MEASURE.test(word) && !NOISE.has(word))
    .map((word) => singular(word.replace(/[.,]+$/, "")))
    .filter(Boolean);
}

export type LineMatch = { consumableId: string; name: string; how: "exact" | "contains" };

/**
 * The tracked consumable a receipt line is, when that is plain: the same
 * words ("Eggs" → Eggs), or every word of a tracked name inside a line that
 * ends on the same noun ("Amul Toned Milk 1L" → Milk, never "Milk bread").
 * When two tracked things fit equally well, nothing is chosen — the person
 * picks, never WonderHome.
 */
export function matchConsumable(line: string, consumables: readonly Pick<Consumable, "id" | "name">[]): LineMatch | null {
  const words = itemWords(line);
  if (words.length === 0) return null;
  const key = words.join(" ");
  const exact = consumables.filter((consumable) => itemWords(consumable.name).join(" ") === key);
  if (exact.length === 1) return { consumableId: exact[0]!.id, name: exact[0]!.name, how: "exact" };
  if (exact.length > 1) return null;

  // Every word of the tracked name is on the line, and the line is the same
  // kind of thing: its last word — the noun a product name ends on, "Toned
  // Milk", "Basmati Rice" — is the tracked name's too. "Milk bread" is bread.
  const present = new Set(words);
  const head = words[words.length - 1];
  const contained = consumables
    .map((consumable) => ({ consumable, words: itemWords(consumable.name) }))
    .filter((entry) => entry.words.length > 0 && entry.words[entry.words.length - 1] === head && entry.words.every((word) => present.has(word)));
  if (contained.length === 0) return null;
  const most = Math.max(...contained.map((entry) => entry.words.length));
  const best = contained.filter((entry) => entry.words.length === most);
  return best.length === 1 ? { consumableId: best[0]!.consumable.id, name: best[0]!.consumable.name, how: "contains" } : null;
}

export type PurchaseHistory = {
  lastPurchasedOn: string | null;
  lastPurchasedQuantity: number | null;
  daysPerUnit: number | null;
  evidenceBasis: EvidenceBasis | null;
};

/**
 * What a consumable's history says once its purchases are what they are now
 * — after one is recorded, or after one is undone. The last purchase is the
 * latest day (several lines on one day are one shop). A rate the household
 * stated, or a configured inventory, is theirs and stays; only a rate that
 * was inferred from purchases (or none at all) is re-inferred, and it goes
 * away again when the purchases no longer support it.
 */
export function historyFrom(purchases: readonly Purchase[], current: Pick<Consumable, "daysPerUnit" | "evidenceBasis">): PurchaseHistory {
  const dated = purchases.filter((purchase) => /^\d{4}-\d{2}-\d{2}$/.test(purchase.purchasedOn) && purchase.quantity > 0);
  const latest = dated.reduce<string | null>((max, purchase) => (max === null || purchase.purchasedOn > max ? purchase.purchasedOn : max), null);
  const lastQuantity = latest === null ? null : dated.filter((purchase) => purchase.purchasedOn === latest).reduce((sum, purchase) => sum + purchase.quantity, 0);

  const keepsOwn = current.evidenceBasis !== null && current.evidenceBasis !== "purchase_history";
  const inferred = keepsOwn ? null : inferRate(dated);
  return {
    lastPurchasedOn: latest,
    lastPurchasedQuantity: lastQuantity,
    daysPerUnit: keepsOwn ? current.daysPerUnit : (inferred?.daysPerUnit ?? null),
    evidenceBasis: keepsOwn ? current.evidenceBasis : (inferred ? "purchase_history" : null),
  };
}

/** A three-letter currency code, from what a receipt or model wrote ("₹", "Rs.", "inr", "$"). Null when it cannot be told. */
export function currencyCode(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^[A-Za-z]{3}$/.test(value)) return value.toUpperCase();
  if (/^(?:₹|rs\.?|inr)$/i.test(value)) return "INR";
  if (value === "£") return "GBP";
  if (value === "€") return "EUR";
  return null;
}

/**
 * One unit's cost in minor units, when the line says what it cost and the
 * currency is known — the only boundary where money becomes paise/cents
 * (CLAUDE.md rule 22). Otherwise no cost is kept rather than a guessed one.
 */
export function unitCostMinor(lineTotal: number | null, quantity: number, currency: string | null): number | null {
  if (lineTotal === null || !Number.isFinite(lineTotal) || lineTotal < 0 || !currency || quantity <= 0) return null;
  return Math.round((lineTotal * 100) / quantity);
}
