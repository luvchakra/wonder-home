import { normalizeUnit, toBase } from "../units";
import type { InstamartVariant } from "./client";

/**
 * Which Instamart product a shopping-list line most likely means, and how
 * many packs cover it (story 25-032). Rules, not a model, and only ever a
 * suggestion: the person sees the pick, can change it to any other result or
 * leave the line out, and nothing reaches Swiggy's cart until they review it.
 *
 * - Only what is in stock is suggested.
 * - A product whose name carries every word of the item's name ranks first,
 *   then one that carries some of them.
 * - Among those, the pack that covers what is needed with the least left over
 *   wins; a pack in a unit that does not convert (a bunch, a pack) is one
 *   pack per line. Equal cost goes to fewer packs.
 * - Packs never exceed what Swiggy allows for that product.
 */

export type ListLine = { entryId: string; itemId: string; name: string; quantity: number; unit: string };

export type Suggestion = { variant: InstamartVariant; packs: number; covers: "exact" | "more" | "unknown" };

/** "500 g", "1 L", "6 pcs", "2 x 200 ml" as an amount in base units; null when it is not one. */
export function packAmount(pack: string): { quantity: number; unit: string } | null {
  const text = pack.toLowerCase().replace(/,/g, "").trim();
  const multi = text.match(/^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([a-z]+)/);
  const single = text.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)/);
  const [count, amount, word] = multi ? [Number(multi[1]), Number(multi[2]), multi[3]!] : single ? [1, Number(single[1]), single[2]!] : [0, 0, ""];
  if (!(count > 0) || !(amount > 0)) return null;
  const unit = normalizeUnit(word === "pc" || word === "piece" || word === "pieces" ? "pcs" : word);
  if (!unit || !["g", "kg", "ml", "l", "pcs", "dozen"].includes(unit)) return null;
  const base = toBase(count * amount, unit);
  return { quantity: base.quantity, unit: base.unit };
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

/** How well a product's name carries the item's name: 2 every word, 1 some, 0 none. */
export function nameFit(itemName: string, productName: string): number {
  const wanted = words(itemName);
  const have = new Set(words(productName).flatMap((word) => [word, word.replace(/s$/, "")]));
  const found = wanted.filter((word) => have.has(word) || have.has(word.replace(/s$/, ""))).length;
  if (wanted.length === 0 || found === 0) return 0;
  return found === wanted.length ? 2 : 1;
}

/** Packs of `variant` that cover `line`, capped by Swiggy's own limit. */
export function packsFor(line: Pick<ListLine, "quantity" | "unit">, variant: Pick<InstamartVariant, "pack" | "maxQuantity">): { packs: number; covers: Suggestion["covers"] } {
  const cap = variant.maxQuantity && variant.maxQuantity > 0 ? variant.maxQuantity : 10;
  const pack = packAmount(variant.pack);
  const unit = normalizeUnit(line.unit);
  const wanted = unit && ["g", "kg", "ml", "l", "pcs", "dozen"].includes(unit) ? toBase(line.quantity, unit) : null;
  if (!pack || !wanted || pack.unit !== wanted.unit || !(wanted.quantity > 0)) return { packs: 1, covers: "unknown" };
  const packs = Math.min(cap, Math.max(1, Math.ceil(wanted.quantity / pack.quantity - 1e-9)));
  return { packs, covers: packs * pack.quantity === wanted.quantity ? "exact" : "more" };
}

export function suggest(line: ListLine, results: readonly InstamartVariant[]): Suggestion | null {
  const ranked = results
    .filter((variant) => variant.inStock)
    .map((variant, index) => {
      const fit = nameFit(line.name, `${variant.brand ?? ""} ${variant.name}`);
      const { packs, covers } = packsFor(line, variant);
      const pack = packAmount(variant.pack);
      const wanted = normalizeUnit(line.unit) ? safeBase(line.quantity, line.unit) : null;
      // Left over once what is needed is covered, in base units; unknown sorts last among equals.
      const leftover = pack && wanted && pack.unit === wanted.unit ? packs * pack.quantity - wanted.quantity : Number.POSITIVE_INFINITY;
      return { variant, packs, covers, fit, leftover, cost: variant.price * packs, index };
    })
    .filter((candidate) => candidate.fit > 0)
    .sort((a, b) => b.fit - a.fit || a.leftover - b.leftover || a.cost - b.cost || a.packs - b.packs || a.index - b.index);
  const best = ranked[0];
  return best ? { variant: best.variant, packs: best.packs, covers: best.covers } : null;
}

function safeBase(quantity: number, unit: string): { quantity: number; unit: string } | null {
  const key = normalizeUnit(unit);
  return key && ["g", "kg", "ml", "l", "pcs", "dozen"].includes(key) ? toBase(quantity, key) : null;
}
