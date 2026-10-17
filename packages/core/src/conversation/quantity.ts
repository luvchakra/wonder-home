import { normalizeUnit, roundQuantity } from "../commerce/units";

/**
 * Amounts in what people say about groceries (Groceries Phase 2, story
 * 09-011): "6 eggs", "half a kilo of tomatoes", "2 kg potatoes", "one
 * litre", "a dozen eggs", "6 more", "500 grams of rice".
 *
 * Rules only — a number is never left to a model. What comes back is the
 * amount, its unit when one was said, whether it adds to what is there
 * ("more") and what is left of the phrase, which is the item's name. No
 * unit means the item's own unit decides later; no number means no amount.
 */

export type SpokenAmount = {
  quantity: number;
  /** Canonical unit when one was said ("kg", "l", "pcs", "bunch"…), else null. */
  unit: string | null;
  /** "6 more" — an increment on what is already there. */
  more: boolean;
};

export type ReadItem = { item: string; amount: SpokenAmount | null };

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100,
  "a couple of": 2, couple: 2, "a few": 3,
};

const UNIT_WORDS =
  "kgs?|kilos?|kilograms?|grams?|gms?|g|mls?|millilitres?|milliliters?|ltrs?|litres?|liters?|l|pcs|pieces?|pc|dozens?|bunch(?:es)?|packs?|packets?|bottles?|box(?:es)?|jars?|cans?|bags?|loaf|loaves|trays?";

const NUMBER = String.raw`(\d+(?:[.,]\d+)?|½|¼|¾|a couple of|a few|couple|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|fifty|hundred|an?)`;

function numberValue(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (text === "½") return 0.5;
  if (text === "¼") return 0.25;
  if (text === "¾") return 0.75;
  if (/^\d/.test(text)) {
    const value = Number(text.replace(",", "."));
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return WORD_NUMBERS[text] ?? null;
}

/**
 * One phrase: "6 more eggs", "half a kilo of tomatoes", "eggs", "6 more".
 * A bare article ("a milk") is not an amount; "a dozen eggs" is.
 */
export function readItemAmount(phrase: string): ReadItem {
  let text = phrase.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");

  // "half a kilo of tomatoes", "half a litre milk", "quarter kg"
  const half = text.match(new RegExp(String.raw`^(half|quarter)(?: an?)? (${UNIT_WORDS})\b(?: of)?\s*(.*)$`, "i"));
  if (half) {
    const unit = normalizeUnit(half[2]!);
    return { item: cleanItem(half[3] ?? ""), amount: { quantity: half[1]!.toLowerCase() === "half" ? 0.5 : 0.25, unit, more: false } };
  }

  // "6 more (eggs)", "2 kg (more) potatoes", "a dozen eggs", "500 grams of rice", "1.5kg rice"
  // A number runs straight into its unit ("1.5kg") or is followed by a space; "7up" is a name.
  const full = text.match(new RegExp(String.raw`^${NUMBER}(?:\s+|(?=(?:${UNIT_WORDS})\b)|$)(more\b\s*)?(?:(${UNIT_WORDS})\b\.?\s*)?(more\b\s*)?(?:of\s+)?(.*)$`, "i"));
  if (full) {
    const quantity = numberValue(full[1]!);
    const unitWord = full[3];
    const rest = (full[5] ?? "").trim();
    const more = Boolean(full[2] || full[4]);
    // "a milk", "an apple" — an article, not an amount, unless a unit or "more" follows.
    const articleOnly = /^an?$/i.test(full[1]!) && !unitWord && !more;
    // A number said on its own ("add 6") is an amount of whatever was just discussed.
    const bareNumber = !rest && !unitWord && !more && /^\d/.test(full[1]!);
    if (quantity && !articleOnly && (rest || unitWord || more || bareNumber)) {
      return { item: cleanItem(rest), amount: { quantity: roundQuantity(quantity), unit: unitWord ? normalizeUnit(unitWord) : null, more } };
    }
  }

  // "more eggs" — an increment with no number: one of whatever its step is.
  const moreOnly = text.match(/^(?:some )?more (.+)$/i);
  if (moreOnly) return { item: cleanItem(moreOnly[1]!), amount: null };

  text = text.replace(/^(?:some|the|a|an)\s+/i, "");
  return { item: cleanItem(text), amount: null };
}

function cleanItem(text: string): string {
  return text
    .replace(/^(?:of|the|some)\s+/i, "")
    .replace(/\s+(?:to|on|onto|into|in|for)\s+(?:the|my|our)?\s*(?:grocery|groceries|shopping|shopping list|list|cart)\b.*$/i, "")
    .replace(/\s+(?:in|from)\s+the\s+(?:fridge|freezer|pantry|kitchen|cupboard)$/i, "")
    .trim();
}

/** "Make that 2 litres" / "make it 500 grams" — a new total for the thing just discussed. */
export function readMakeThat(utterance: string): SpokenAmount | null {
  const match = utterance.trim().match(new RegExp(String.raw`^(?:no,?\s*)?(?:actually,?\s*)?make (?:that|it) ${NUMBER}\s*(${UNIT_WORDS})?\b\.?$`, "i"));
  if (!match) return null;
  const quantity = numberValue(match[1]!);
  return quantity ? { quantity: roundQuantity(quantity), unit: match[2] ? normalizeUnit(match[2]) : null, more: false } : null;
}
