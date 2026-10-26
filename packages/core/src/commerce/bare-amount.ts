import { ladderForItem, type Ladder } from "./buying-sizes";
import { compatible, formatAmount, roundQuantity, toBase, unitInfo, type Amount } from "./units";

/**
 * What a number said with no unit means for an item (HomeFood 25-037, the
 * owner on WhatsApp, 2026-10-26: "2 for milk should not be 2ml, should be 2L
 * ... 2 for eggs should not be 2 dozen, should be 2 pieces of eggs").
 *
 * One rule, read from what the item already carries — its unit, the catalog
 * entry's category, pack and ladder — never from how the database happens
 * to store it (millilitres, a dozen):
 *
 *  - **Liquids** (kept by volume): litres. 2 milk is 2 L. A liquid the
 *    catalog sells only in small packs (buttermilk, 200 ml) counts packs.
 *  - **Counted things** (pieces, a dozen): pieces. 2 eggs is 2 pcs, never 2
 *    dozen. An item kept in its own counting word (loaf, bunch, packet,
 *    bottle) counts that: 2 bread is 2 loaves.
 *  - **Loose weighed staples** (kept by weight, sold by the kilo or half
 *    kilo: rice, atta, dal, sugar, salt, vegetables, fruit, meat): kg.
 *  - **Small weighed things** (spices, tea, butter, paneer, cheese, dry
 *    fruit: a ladder under 250 g): the pack the catalog sells — 2 paneer is
 *    2 × 200 g. A number of 50 or more is grams ("200 paneer" is 200 g): no
 *    one buys fifty packs of a spice.
 *  - **Things people count but the list keeps by weight** (lemons, apples,
 *    bananas by the kilo): no weight is guessed for a piece, so it is asked.
 *
 * A number past what anyone buys of it at once (2000 milk, 500 rice, 300
 * eggs) is asked about once — "Did you mean 2000 ml?" — never guessed.
 * An amount said with its unit never comes here: "2 dozen eggs" is 24 pcs,
 * "500 ml milk" is 0.5 L.
 */

export type BareItem = {
  name: string;
  /** The unit the household keeps it in. */
  unit: string;
  /** The household's own + and − step, in `unit`. */
  step?: number | null;
  /** What the catalog says about it, when it came from the catalog. */
  catalog?: { category?: string | null; subcategory?: string | null; pack?: Amount | null; ladder?: Ladder | null } | null;
};

export type BareRule =
  | { kind: "litre" | "piece" | "own" | "kilo"; one: Amount; most: number }
  | { kind: "pack"; one: Amount; most: number }
  /** Counted by people, kept by weight or volume: a number alone can't be read. */
  | { kind: "unclear"; one: null; most: 0 };

export type BareReading =
  | { kind: "amount"; amount: Amount }
  /** One question; `meant` is what "yes" to it adds, when there is one. */
  | { kind: "ask"; question: string; meant: Amount | null };

/** Things people count one by one, whatever the list keeps them in. */
const COUNTED_BY_PEOPLE = /^(?:fresh |green |raw |ripe )?(?:eggs?|lemons?|limes?|nimbu|bananas?|kela|coconuts?|oranges?|apples?|mangoe?s?|avocados?|kiwis?|pomegranates?)\b(?![ ,(]*(?:oil|milk|water|powder|grated|desiccated|paste|juice|pulp|jam|chips|flour|cream))/i;

/** Loose staples a household made by hand (no catalog entry): bought by the kilo. */
const LOOSE_STAPLES = /\b(?:rice|chawal|atta|flour|maida|besan|sooji|suji|rava|poha|dal|daal|lentils?|chana|rajma|moong|urad|masoor|toor|sugar|chini|salt|jaggery|gur|wheat|onions?|potato(?:es)?|aloo|tomato(?:es)?|vegetables?|sabzi|chicken|mutton|fish|meat)\b/i;

const MOST = { litre: 20, piece: 60, own: 20, kilo: 25, pack: 20 } as const;

/** The rule for one item. Pure: the catalog's data first, a name only where the item has none. */
export function bareRule(item: BareItem): BareRule {
  const info = unitInfo(item.unit);
  if (info.dimension === "count") return { kind: "piece", one: { quantity: 1, unit: "pcs" }, most: MOST.piece };
  if (info.dimension === "each") return { kind: "own", one: { quantity: 1, unit: info.key }, most: MOST.own };

  const pack = item.catalog?.pack && compatible(item.catalog.pack.unit, item.unit) ? toBase(item.catalog.pack.quantity, item.catalog.pack.unit) : null;
  if (info.dimension === "volume") {
    if (pack && pack.quantity < 250) return { kind: "pack", one: pack, most: MOST.pack };
    return { kind: "litre", one: { quantity: 1, unit: "l" }, most: MOST.litre };
  }

  // By weight: no weight is guessed for a lemon; kilos for what is sold by
  // the kilo or half kilo; else the pack.
  if (COUNTED_BY_PEOPLE.test(item.name)) return { kind: "unclear", one: null, most: 0 };
  if (info.key === "kg") return { kind: "kilo", one: { quantity: 1, unit: "kg" }, most: MOST.kilo };
  if (pack && pack.quantity >= 1000) return { kind: "kilo", one: { quantity: 1, unit: "kg" }, most: MOST.kilo };
  if (!item.catalog?.category && LOOSE_STAPLES.test(item.name)) return { kind: "kilo", one: { quantity: 1, unit: "kg" }, most: MOST.kilo };
  const ladder =
    item.catalog?.ladder && item.catalog.ladder.unit === "g"
      ? item.catalog.ladder
      : item.catalog?.category
        ? ladderForItem({ category: item.catalog.category, subcategory: item.catalog.subcategory ?? null, name: item.name, unit: item.unit })
        : null;
  const rung = ladder?.sizes[0] ?? null;
  if (rung !== null && rung >= 250) return { kind: "kilo", one: { quantity: 1, unit: "kg" }, most: MOST.kilo };
  if (pack) return { kind: "pack", one: pack, most: MOST.pack };
  if (item.step && item.step > 0) return { kind: "pack", one: toBase(item.step, item.unit), most: MOST.pack };
  if (rung !== null) return { kind: "pack", one: { quantity: rung, unit: "g" }, most: MOST.pack };
  // Kept in grams, nothing known about it: a number alone is not readable.
  return { kind: "unclear", one: null, most: 0 };
}

/** "2 L", "500 g", "6 pcs", "2 loaves" — an amount as a reply says it. */
export function sayAmount(amount: Amount): string {
  return formatAmount(amount, "en", englishCount);
}

/** "pc"/"pcs", "loaf"/"loaves", "bunch"/"bunches" — English count words. */
export function englishCount(unit: string, quantity: number): string {
  if (unit === "pcs") return quantity === 1 ? "pc" : "pcs";
  if (unit === "dozen" || quantity === 1) return unit;
  if (/(?:ch|sh|x|s)$/.test(unit)) return `${unit}es`;
  if (unit === "loaf") return "loaves";
  return `${unit}s`;
}

function times(one: Amount, count: number): Amount {
  return { quantity: roundQuantity(one.quantity * count), unit: one.unit };
}

/**
 * What `count` said alone means for `item`: an amount (in the rule's own
 * unit — litres, pieces, kilos), or the one question to ask instead.
 */
export function readBareNumber(count: number, item: BareItem): BareReading {
  const rule = bareRule(item);
  const name = item.name.toLowerCase();
  const number = roundQuantity(count);
  const plain = new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(number);
  const info = unitInfo(item.unit);
  if (rule.kind === "unclear") {
    const examples = info.dimension === "volume" ? '"500 ml" or "1 litre"' : info.dimension === "mass" ? '"500 g" or "1 kg"' : '"6" or "a dozen"';
    return { kind: "ask", meant: null, question: `${item.name} is kept by ${info.dimension === "volume" ? "volume" : "weight"} on your list, so I can't tell how much ${plain} is. How much should it be? For example ${examples}.` };
  }
  if (number <= rule.most) return { kind: "amount", amount: times(rule.one, number) };
  // A small pack's grams: "200 paneer" is 200 g.
  if (rule.kind === "pack" && rule.one.unit === "g" && number >= 50 && number <= 5000) return { kind: "amount", amount: { quantity: number, unit: "g" } };
  const small = rule.kind === "litre" ? "ml" : rule.kind === "kilo" || (rule.kind === "pack" && rule.one.unit === "g") ? "g" : rule.kind === "pack" ? "ml" : null;
  if (small && number >= 50) {
    const meant = { quantity: number, unit: small };
    return { kind: "ask", meant, question: `Did you mean ${sayAmount(meant)} of ${name}? Say "yes", or tell me the amount with its unit, like ${unitExample(rule)}.` };
  }
  const meant = times(rule.one, number);
  return { kind: "ask", meant, question: `Did you mean ${sayAmount(meant)} of ${name}? That's more than usual. Say "yes", or tell me the amount with its unit, like ${unitExample(rule)}.` };
}

/** An amount said with its unit, as an example: "2 litres", "2 kg". */
function unitExample(rule: Exclude<BareRule, { kind: "unclear" }>): string {
  switch (rule.kind) {
    case "litre":
      return '"2 litres"';
    case "kilo":
      return '"2 kg"';
    case "piece":
      return '"2 dozen"';
    case "own":
      return `"2 ${englishCount(rule.one.unit, 2)}"`;
    case "pack":
      return `"${sayAmount(times(rule.one, 2))}"`;
  }
}

/**
 * Examples for "how much should I add?" that read back as they say: every
 * bare number in them means what the rule says it means.
 */
export function bareExamples(item: BareItem | null): string {
  if (!item) return "1 litre, 1 kg or 2 packets";
  const rule = bareRule(item);
  switch (rule.kind) {
    case "litre":
      return "1 litre or 500 ml";
    case "kilo":
      return "1 kg or 500 g";
    case "piece":
      return "6 or a dozen";
    case "own":
      return `1 ${englishCount(rule.one.unit, 1)} or 2 ${englishCount(rule.one.unit, 2)}`;
    case "pack":
      return `${sayAmount(rule.one)} or ${sayAmount(times(rule.one, 2))}`;
    case "unclear":
      return unitInfo(item.unit).dimension === "volume" ? "500 ml or 1 litre" : "500 g or 1 kg";
  }
}

/** One example for one item in a "how much of each?" answer: "1 litre milk", "6 eggs", "2 loaves bread". */
export function bareExampleFor(name: string, item: BareItem | null): string {
  const word = name.toLowerCase();
  if (!item) return `1 ${word}`;
  const rule = bareRule(item);
  switch (rule.kind) {
    case "litre":
      return `1 litre ${word}`;
    case "kilo":
      return `1 kg ${word}`;
    case "piece":
      return `6 ${word}`;
    case "own":
      return `2 ${englishCount(rule.one.unit, 2)} ${word}`;
    case "pack":
      return `${sayAmount(times(rule.one, 2))} ${word}`;
    case "unclear":
      return `${unitInfo(item.unit).dimension === "volume" ? "500 ml" : "500 g"} ${word}`;
  }
}

/** Whether a bare "2" reads as 2 of the rule's own unit for this item — so "2 of each" is a fair example. */
export function bareTwoReads(item: BareItem | null): boolean {
  if (!item) return true;
  const rule = bareRule(item);
  return rule.kind !== "unclear" && rule.most >= 2;
}
