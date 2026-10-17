/**
 * Units for groceries (Groceries Phase 1, design/GROCERIES-PANTRY-HOMETALK-PHASE0.md §4.1).
 *
 * Every amount a household keeps — on hand or to buy — is a quantity and a
 * unit, and the arithmetic between two of them is only ever done here. Three
 * dimensions convert (mass in grams, volume in millilitres, a count in
 * pieces); anything else — a bunch, a pack, a jar — is its own dimension and
 * only adds to itself. Nothing guesses a weight for a piece.
 *
 * Quantities are kept to three decimals (numeric(12,3) in the database) and
 * never go below zero: a subtraction past nothing stops at nothing and says
 * that it did.
 */

export type Dimension = "mass" | "volume" | "count" | "each";

export type UnitInfo = {
  /** The canonical key stored in the database: "g", "kg", "ml", "l", "pcs", "dozen", or a household's own word. */
  key: string;
  dimension: Dimension;
  /** The base unit of its dimension: g, ml, pcs — or itself for an "each" unit. */
  base: string;
  /** How many base units one of this unit is. */
  factor: number;
};

const KNOWN: Record<string, Omit<UnitInfo, "key">> = {
  g: { dimension: "mass", base: "g", factor: 1 },
  kg: { dimension: "mass", base: "g", factor: 1000 },
  ml: { dimension: "volume", base: "ml", factor: 1 },
  l: { dimension: "volume", base: "ml", factor: 1000 },
  pcs: { dimension: "count", base: "pcs", factor: 1 },
  dozen: { dimension: "count", base: "pcs", factor: 12 },
};

/** Spellings a household (or a receipt) uses for the known units. */
const ALIASES: Record<string, string> = {
  g: "g",
  gm: "g",
  gms: "g",
  gram: "g",
  grams: "g",
  gr: "g",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "l",
  lt: "l",
  ltr: "l",
  ltrs: "l",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
  pcs: "pcs",
  pc: "pcs",
  piece: "pcs",
  pieces: "pcs",
  item: "pcs",
  items: "pcs",
  unit: "pcs",
  units: "pcs",
  nos: "pcs",
  no: "pcs",
  each: "pcs",
  dozen: "dozen",
  dozens: "dozen",
  doz: "dozen",
};

/** Other words a form offers — each its own dimension, singular. */
export const COUNTED_UNITS = [
  "bunch",
  "pack",
  "packet",
  "bottle",
  "box",
  "jar",
  "can",
  "bag",
  "loaf",
  "tray",
] as const;

const PLURAL_TO_SINGULAR: Record<string, string> = {
  bunches: "bunch",
  packs: "pack",
  packets: "packet",
  bottles: "bottle",
  boxes: "box",
  jars: "jar",
  cans: "can",
  bags: "bag",
  loaves: "loaf",
  trays: "tray",
};

/** The units a picker offers first, in the order a person reaches for them. */
export const UNIT_CHOICES = [
  "pcs",
  "g",
  "kg",
  "ml",
  "l",
  "dozen",
  ...COUNTED_UNITS,
] as const;

/**
 * The canonical key for what someone typed, or null for nothing usable.
 * An unknown word is kept (lowercased, trimmed, 1–20 characters) as a unit of
 * its own — a household's "sachet" is a real unit, it just converts to nothing.
 */
export function normalizeUnit(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const word = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!word) return null;
  if (ALIASES[word]) return ALIASES[word];
  if (PLURAL_TO_SINGULAR[word]) return PLURAL_TO_SINGULAR[word];
  return word.slice(0, 20);
}

export function unitInfo(unit: string): UnitInfo {
  const key = normalizeUnit(unit) ?? "pcs";
  const known = KNOWN[key];
  return known
    ? { key, ...known }
    : { key, dimension: "each", base: key, factor: 1 };
}

/** Whether two units measure the same thing, so one can be added to the other. */
export function compatible(a: string, b: string): boolean {
  const left = unitInfo(a);
  const right = unitInfo(b);
  return left.base === right.base;
}

/** Three decimals, the database's own precision — and never "-0". */
export function roundQuantity(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** An amount in another unit of the same dimension, or null when they do not convert. */
export function convert(
  quantity: number,
  from: string,
  to: string,
): number | null {
  const source = unitInfo(from);
  const target = unitInfo(to);
  if (source.base !== target.base) return null;
  return roundQuantity((quantity * source.factor) / target.factor);
}

/** An amount in its dimension's base unit — what balances and list entries store. */
export function toBase(
  quantity: number,
  unit: string,
): { quantity: number; unit: string } {
  const info = unitInfo(unit);
  return { quantity: roundQuantity(quantity * info.factor), unit: info.base };
}

export type Amount = { quantity: number; unit: string };

/** `a + b`, in `a`'s base unit; null when the units do not convert. */
export function addAmounts(a: Amount, b: Amount): Amount | null {
  if (!compatible(a.unit, b.unit)) return null;
  const left = toBase(a.quantity, a.unit);
  const right = toBase(b.quantity, b.unit);
  return {
    quantity: roundQuantity(left.quantity + right.quantity),
    unit: left.unit,
  };
}

/** `a − b`, never below zero, in `a`'s base unit — `clamped` says it stopped at nothing. Null when the units do not convert. */
export function subtractAmounts(
  a: Amount,
  b: Amount,
): (Amount & { clamped: boolean }) | null {
  if (!compatible(a.unit, b.unit)) return null;
  const left = toBase(a.quantity, a.unit);
  const right = toBase(b.quantity, b.unit);
  const raw = roundQuantity(left.quantity - right.quantity);
  return { quantity: Math.max(0, raw), unit: left.unit, clamped: raw < 0 };
}

/** The usual step for a stepper in this unit, in that unit. */
export function defaultStep(unit: string): number {
  switch (unitInfo(unit).key) {
    case "g":
      return 100;
    case "kg":
      return 0.5;
    case "ml":
      return 250;
    case "l":
      return 0.5;
    default:
      return 1;
  }
}

/** One step of an item's stepper, in base units: its own step if set, else the unit's usual one. */
export function stepInBase(
  preferredUnit: string,
  step: number | null | undefined,
): Amount {
  const size = step && step > 0 ? step : defaultStep(preferredUnit);
  return toBase(size, preferredUnit);
}

/**
 * The unit a reader would say it in: 1500 g is "1.5 kg", 250 ml stays "250 ml",
 * 24 pcs stays "24 pcs" (a dozen is a way to buy, not a way to count).
 */
export function displayAmount(amount: Amount): Amount {
  const info = unitInfo(amount.unit);
  const base = toBase(amount.quantity, amount.unit);
  if (info.dimension === "mass")
    return base.quantity >= 1000
      ? { quantity: roundQuantity(base.quantity / 1000), unit: "kg" }
      : base;
  if (info.dimension === "volume")
    return base.quantity >= 1000
      ? { quantity: roundQuantity(base.quantity / 1000), unit: "l" }
      : base;
  if (info.dimension === "count") return base;
  return { quantity: roundQuantity(amount.quantity), unit: info.key };
}

/** The abbreviation shown after a number, for the units that have one everywhere. */
const SYMBOLS: Record<string, string> = { g: "g", kg: "kg", ml: "ml", l: "L" };

/**
 * "1.5 kg", "500 g", "1 L", "6 pcs", "1 bunch" — the number in the reader's
 * locale. Words for a count ("pcs", "bunch") come from `countWord`, so a
 * catalog can put them into the reader's language; the metric symbols are
 * the same in every language this product speaks.
 */
export function formatAmount(
  amount: Amount,
  locale: string,
  countWord?: (unit: string, quantity: number) => string,
): string {
  const shown = displayAmount(amount);
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 3,
  }).format(shown.quantity);
  const symbol = SYMBOLS[shown.unit];
  if (symbol) return `${number} ${symbol}`;
  const word = countWord?.(shown.unit, shown.quantity) ?? shown.unit;
  return `${number} ${word}`;
}

/**
 * A positive amount someone typed ("1.5", "1,5", "½"), or null. Decimals with
 * a comma are read the way a European keyboard writes them.
 */
export function parseQuantity(raw: string): number | null {
  const text = raw.trim().replace(/\s+/g, "");
  if (!text) return null;
  const fractions: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
  if (fractions[text] !== undefined) return fractions[text];
  if (!/^\d+([.,]\d+)?$/.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? roundQuantity(value) : null;
}
