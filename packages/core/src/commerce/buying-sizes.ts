/**
 * The amounts a household actually asks for (HomeFood 25-010): what + and −
 * step through on the list and in Add an item, so the next amount is always
 * one a shop sells and a person would say.
 *
 * Every ladder is linear (the owner, 2026-10-20: "it should be linear"): it
 * starts at the smallest amount a shop sells that kind of thing in and goes up
 * by that same amount, so + and − always move by one even step:
 * - loose vegetables, fruit, meat and fish by 250 g; small aromatics by 50 g;
 * - atta, rice, sugar and salt by 1 kg; dal, flours and grains by 500 g;
 *   spices by 50 g, whole spices by 25 g; oil and milk by 500 ml;
 * - anything counted — eggs, coconuts, packets, bottles, bunches — goes up
 *   one at a time, never a dozen at a time.
 * A ladder of one rung carries on by that rung.
 *
 * Pure and import-free, so the catalog seed (`scripts/catalog-seed.ts`)
 * computes the same ladders with Node's own type stripping. Amounts are in
 * the unit's base: grams, millilitres, or the counted unit itself (a dozen
 * counts in pieces).
 */

export type Ladder = { unit: string; sizes: number[] };

const MASS: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME: Record<string, number> = { ml: 1, l: 1000 };

/** The base unit an amount of this unit is counted in, and how many base units one is. */
export function baseOf(unit: string): { unit: string; factor: number } {
  const key = unit.trim().toLowerCase();
  if (key in MASS) return { unit: "g", factor: MASS[key]! };
  if (key in VOLUME) return { unit: "ml", factor: VOLUME[key]! };
  if (key === "dozen") return { unit: "pcs", factor: 12 };
  return { unit: key || "pcs", factor: 1 };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export const LADDERS = {
  loose: [250],
  small: [50],
  staple: [1000],
  rice: [1000],
  dal: [500],
  flour: [500],
  grain: [500],
  sugar: [1000],
  jaggery: [500],
  salt: [1000],
  spice: [50],
  wholeSpice: [25],
  dryFruit: [100],
  tea: [100],
  coffee: [50],
  dairy: [200],
  ghee: [200],
  packed: [100],
  oil: [500],
  milk: [500],
  liquid: [250],
  one: [1],
} as const satisfies Record<string, readonly number[]>;

/** The ladder for a unit when nothing more is known about the thing. */
export function defaultLadder(unit: string): Ladder {
  const base = baseOf(unit);
  if (base.unit === "g") return { unit: "g", sizes: [...(unit.trim().toLowerCase() === "kg" ? LADDERS.loose : LADDERS.small)] };
  if (base.unit === "ml") return { unit: "ml", sizes: [...LADDERS.liquid] };
  return { unit: base.unit, sizes: [1] };
}

/** A household's own step for + and −, as a ladder of that step. */
export function uniformLadder(unit: string, step: number): Ladder {
  const base = baseOf(unit);
  return { unit: base.unit, sizes: [round(step * base.factor)] };
}

/**
 * The ladder for a curated catalog item, from what it is: its category,
 * subcategory, name and the unit it is kept in. Rules, not guesses: a thing
 * no rule names gets its unit's default.
 */
export function ladderForItem(item: { category: string; subcategory: string | null; name: string; unit: string }): Ladder {
  const base = baseOf(item.unit);
  const name = item.name.toLowerCase();
  const sub = (item.subcategory ?? "").toLowerCase();
  const has = (...words: string[]) => words.some((word) => name.includes(word));
  const ladder = (sizes: readonly number[]): Ladder => ({ unit: base.unit, sizes: [...sizes] });

  if (base.unit !== "g" && base.unit !== "ml") return { unit: base.unit, sizes: [1] };

  if (base.unit === "ml") {
    if (item.category === "Dairy" && has("milk", "buttermilk", "chaas", "lassi")) return ladder(LADDERS.milk);
    if (has("ghee")) return ladder(LADDERS.ghee);
    if (item.category === "Oils & ghee") return ladder(LADDERS.oil);
    return ladder(LADDERS.liquid);
  }

  switch (item.category) {
    case "Vegetables":
    case "Fruits":
      return sub.includes("herb") || has("ginger", "garlic", "chilli", "chili", "curry leaves", "mint", "coriander", "lemongrass") ? ladder(LADDERS.small) : ladder(LADDERS.loose);
    case "Meat & fish":
      return ladder(LADDERS.loose);
    case "Atta & flours":
      return has("atta") ? ladder(LADDERS.staple) : ladder(LADDERS.flour);
    case "Rice & grains":
      if (has("rice") && !has("flake", "puffed", "noodle")) return ladder(LADDERS.rice);
      return ladder(LADDERS.grain);
    case "Dals & pulses":
      return ladder(LADDERS.dal);
    case "Sugar & sweeteners":
      if (has("jaggery", "gur")) return ladder(LADDERS.jaggery);
      if (has("sugar") && !has("free", "icing", "brown")) return ladder(LADDERS.sugar);
      return ladder(LADDERS.packed);
    case "Spices & masalas":
      if (sub.includes("salt") || has("salt", "namak")) return ladder(LADDERS.salt);
      if (sub.includes("whole")) return ladder(LADDERS.wholeSpice);
      return ladder(LADDERS.spice);
    case "Dry fruits, nuts & seeds":
      return ladder(LADDERS.dryFruit);
    case "Dairy":
      return has("ghee") ? ladder(LADDERS.ghee) : ladder(LADDERS.dairy);
    case "Oils & ghee":
      return ladder(LADDERS.ghee);
    case "Beverages":
      if (has("tea", "chai")) return ladder(LADDERS.tea);
      if (has("coffee")) return ladder(LADDERS.coffee);
      return ladder(LADDERS.packed);
    default:
      return base.unit === "g" && item.unit.trim().toLowerCase() === "kg" ? ladder(LADDERS.loose) : ladder(LADDERS.packed);
  }
}

/** The step past the last rung: the ladder's last gap, or its only rung. */
function carryOn(sizes: readonly number[]): number {
  const last = sizes[sizes.length - 1] ?? 1;
  return sizes.length > 1 ? round(last - sizes[sizes.length - 2]!) : last;
}

/**
 * The next amount up or down from `current` (in the ladder's unit): the next
 * rung above or below, carrying on past the last by its last gap; down from
 * the first rung is nothing. An amount between rungs (one typed, or said to
 * HomeTalk) moves to the rung beside it.
 */
export function stepAlong(ladder: Ladder, current: number, direction: 1 | -1): number {
  const sizes = ladder.sizes.length > 0 ? ladder.sizes : [1];
  const last = sizes[sizes.length - 1]!;
  const gap = carryOn(sizes);
  if (direction === 1) {
    const above = sizes.find((size) => size > current + 1e-9);
    if (above !== undefined) return above;
    return round(current < last ? last : last + Math.floor(round((current - last) / gap) + 1e-9) * gap + gap);
  }
  if (current > last + 1e-9) {
    const steps = Math.ceil(round((current - last) / gap) - 1e-9);
    return round(last + (steps - 1) * gap);
  }
  const below = [...sizes].reverse().find((size) => size < current - 1e-9);
  return below ?? 0;
}

/** Where a first add starts: the usual buy if it is on the ladder, else the rung nearest it, else the first. */
export function startAmount(ladder: Ladder, usual: number | null): number {
  const sizes = ladder.sizes.length > 0 ? ladder.sizes : [1];
  if (usual === null || !(usual > 0)) return sizes[0]!;
  if (sizes.length === 1) return Math.max(sizes[0]!, Math.round(usual / sizes[0]!) * sizes[0]!);
  return sizes.reduce((best, size) => (Math.abs(size - usual) < Math.abs(best - usual) ? size : best), sizes[0]!);
}
