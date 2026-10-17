import {
  displayAmount,
  formatAmount,
  unitInfo,
  type Amount,
} from "@wonderhome/core/commerce/units";

import type { GroceryWords } from "../../_lib/grocery-words";

const SYMBOLS: Record<string, string> = { g: "g", kg: "kg", ml: "ml", l: "L" };

/**
 * Amounts in the reader's words, in the browser as on the server: "1.5 kg",
 * "6 pcs", "1 bunch". A zero is said in the item's own unit ("0 kg", not
 * "0 g"), so an empty stepper still says what it counts.
 */
export function sayAmount(
  words: Pick<GroceryWords, "language" | "unitWords">,
  amount: Amount,
  preferredUnit?: string,
): string {
  const plural = new Intl.PluralRules(words.language);
  const countWord = (unit: string, quantity: number) =>
    words.unitWords[unit]?.[plural.select(quantity)] ??
    words.unitWords[unit]?.other ??
    unit;
  if (amount.quantity === 0 && preferredUnit) {
    // Not through `displayAmount`, which would put 0 kg back into grams.
    const key = unitInfo(preferredUnit).key;
    return `${new Intl.NumberFormat(words.language).format(0)} ${SYMBOLS[key] ?? countWord(key, 0)}`;
  }
  return formatAmount(amount, words.language, countWord);
}

/** `{name}`, `{amount}`, `{count}` … filled in; anything else left out. */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    values[key] === undefined ? "" : String(values[key]),
  );
}

/** The right plural form of a sentence for a count. */
export function pluralOf(
  language: string,
  table: Record<string, string>,
  count: number,
): string {
  const category = new Intl.PluralRules(language).select(count);
  return fill(table[category] ?? table.other ?? "", { count });
}

/** The units an amount of this item may be typed in: the ones its own unit converts to. */
export function unitsFor(preferredUnit: string): string[] {
  const info = unitInfo(preferredUnit);
  if (info.dimension === "mass") return ["g", "kg"];
  if (info.dimension === "volume") return ["ml", "l"];
  if (info.dimension === "count") return ["pcs", "dozen"];
  return [info.key];
}

/** The unit a person would type this amount in — the one it is shown in. */
export function shownUnit(amount: Amount, preferredUnit: string): string {
  return amount.quantity === 0
    ? unitInfo(preferredUnit).key
    : displayAmount(amount).unit;
}

export function newKey(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
