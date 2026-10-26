import { englishCount } from "./bare-amount";
import { compatible, roundQuantity, toBase, unitInfo, type Amount } from "./units";

/**
 * An amount said in another kind of unit than the item is counted in
 * (HomeFood 25-038; the owner, 2026-10-26, on WhatsApp: "add 1 litre coconut
 * oil" met "Coconut oil is kept in bottle, so 1 l does not fit it").
 *
 *  - A pack size is known (the catalog's pack, e.g. a 1 L bottle): the
 *    amount becomes whole packs — or, for an item kept by weight or volume,
 *    "2 bottles" becomes twice the pack. Only a whole number of packs, or
 *    within `TOLERANCE` of one; never a silent round of half a bottle.
 *  - Otherwise: the one question, in words, with practical choices — 1 or 2
 *    of the item's own unit, or "Count it in litres instead", which changes
 *    how the item is counted (`commerce/unit-change.ts`) and adds the amount.
 *
 * Pure: grounding asks with it before anything is written, and the grocery
 * writes convert with it, so the two never disagree.
 */

export type AcrossItem = { name: string; unit: string; catalog?: { pack: Amount | null } | null };

export type AcrossReading =
  | { kind: "same" }
  /** `amount` is in the item's base unit; `packs` how many packs it is. */
  | { kind: "packs"; amount: Amount; packs: number; said: Amount }
  | { kind: "ask"; question: string; choices: string[]; switchTo: string };

/** How far from a whole pack still counts as that pack: 1 L for a 975 ml bottle is 1 bottle. */
export const TOLERANCE = 0.05;

/** A bottle, a packet, pieces: counted, not weighed or measured. */
function counted(unit: string): boolean {
  const info = unitInfo(unit);
  return info.dimension === "each" || info.dimension === "count";
}

/** "litres", "kilograms", "bottles" — a unit as a word, for "Count it in … instead". */
export function unitName(unit: string, quantity = 2): string {
  const key = unitInfo(unit).key;
  const one = quantity === 1;
  switch (key) {
    case "l":
      return one ? "litre" : "litres";
    case "ml":
      return one ? "millilitre" : "millilitres";
    case "kg":
      return one ? "kilogram" : "kilograms";
    case "g":
      return one ? "gram" : "grams";
    case "pcs":
      return one ? "piece" : "pieces";
    default:
      return englishCount(key, quantity);
  }
}

/** "1 litre", "500 ml", "2 bottles" — an amount as said aloud, never a bare code like "l". */
export function amountWords(amount: Amount): string {
  const key = unitInfo(amount.unit).key;
  const number = new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(amount.quantity);
  if (key === "ml" || key === "g" || key === "kg") return `${number} ${key}`;
  return `${number} ${unitName(key, amount.quantity)}`;
}

/** Two practical amounts in the item's own unit, as a person would answer. */
function practical(unit: string): string[] {
  const key = unitInfo(unit).key;
  if (key === "g") return ["500 g", "1 kg"];
  if (key === "ml") return ["500 ml", "1 litre"];
  return [amountWords({ quantity: 1, unit: key }), amountWords({ quantity: 2, unit: key })];
}

export function readAcrossUnits(said: Amount, item: AcrossItem): AcrossReading {
  if (compatible(said.unit, item.unit)) return { kind: "same" };
  const pack = item.catalog?.pack ?? null;
  const own = unitInfo(item.unit);
  // Kept in bottles, said in litres: whole bottles of a known size.
  if (counted(item.unit) && !counted(said.unit) && pack && compatible(pack.unit, said.unit)) {
    const each = toBase(pack.quantity, pack.unit).quantity;
    const packs = each > 0 ? toBase(said.quantity, said.unit).quantity / each : 0;
    const whole = Math.round(packs);
    if (whole >= 1 && Math.abs(packs - whole) <= TOLERANCE * whole) {
      return { kind: "packs", amount: { quantity: whole, unit: own.base }, packs: whole, said };
    }
  }
  // Kept in litres, said in bottles: a whole number of packs of a known size.
  if (!counted(item.unit) && counted(said.unit) && pack && compatible(pack.unit, item.unit) && Number.isInteger(said.quantity) && said.quantity >= 1) {
    const each = toBase(pack.quantity, pack.unit);
    return { kind: "packs", amount: { quantity: roundQuantity(each.quantity * said.quantity), unit: each.unit }, packs: said.quantity, said };
  }
  const kept = unitName(item.unit);
  const size = pack && counted(item.unit) && !counted(pack.unit) ? ` of ${amountWords(pack)}` : "";
  const question = counted(item.unit)
    ? `${item.name} is kept in ${kept}${size}. How many ${kept} should I add for ${amountWords(said)}?`
    : `${item.name} is kept in ${kept}. How much is ${amountWords(said)} in ${kept}?`;
  const switchTo = unitInfo(said.unit).key;
  const choices = [...practical(item.unit), `Count it in ${unitName(switchTo)} instead`];
  return { kind: "ask", question: `${question} For example "${choices[0]}", "${choices[1]}", or "${choices[2]!.toLowerCase()}".`, choices, switchTo };
}

/** Whether a reply picks "Count it in litres instead". */
export function picksSwitch(reply: string, switchTo: string): boolean {
  const words = reply.trim().toLowerCase();
  const name = unitName(switchTo);
  const stem = name.replace(/s$/, "");
  return new RegExp(`\\b(?:count|keep|use|track|in)\\b[^.?!]*\\b(?:${stem}s?|${switchTo})\\b`).test(words) && !/^\s*\d/.test(words);
}
