import { roundQuantity, toBase } from "./units";

/**
 * The cart (the owner, 2026-10-20): what is on the shopping list, with what
 * each line is likely to cost and what the whole list comes to.
 *
 * A price is arithmetic somebody can explain (rule 9), and only ever from a
 * receipt the household recorded: the last time the item was bought with a
 * cost, that cost per unit times the amount now on the list. It is only
 * worked out when the purchase's unit converts to the list's (grams to
 * grams, litres to millilitres); otherwise the line says what was paid last
 * time and for how much, and is left out of the total. An item never bought
 * with a cost on record has no price, and is said apart — never counted as
 * nothing. Money stays in minor units here and is shown in the major unit by
 * the screen (rule 22).
 *
 * Pure: the page hands it the list lines and the last priced purchase of each.
 */

export type CartListLine = {
  itemId: string;
  name: string;
  /** What is to buy, in the list's own unit (a base unit: g, ml, pcs…). */
  quantity: number;
  unit: string;
};

export type PricedPurchase = {
  itemId: string;
  /** How much was bought, in `unit` when the receipt said it. */
  quantity: number;
  unit: string | null;
  unitCostMinor: number;
  currency: string;
  purchasedOn: string;
  merchant: string | null;
};

export type CartLine = CartListLine & {
  price:
    | { kind: "estimate"; minor: number; currency: string; perBaseMinor: number; baseUnit: string; from: PricedPurchase }
    | { kind: "last_paid"; minor: number; currency: string; from: PricedPurchase }
    | { kind: "none" };
};

export type CartTotal = { currency: string; minor: number; lines: number };

export type Cart = {
  lines: CartLine[];
  /** One per currency the estimates are in; usually one. */
  totals: CartTotal[];
  /** Lines with a price in the total, and lines without one. */
  priced: number;
  unpriced: number;
};

export function buildCart(list: readonly CartListLine[], purchases: readonly PricedPurchase[]): Cart {
  const latest = new Map<string, PricedPurchase>();
  for (const purchase of purchases) {
    const known = latest.get(purchase.itemId);
    if (!known || purchase.purchasedOn > known.purchasedOn) latest.set(purchase.itemId, purchase);
  }
  const lines: CartLine[] = list.map((line) => {
    const from = latest.get(line.itemId);
    if (!from) return { ...line, price: { kind: "none" } };
    const paid = Math.round(from.unitCostMinor * from.quantity);
    if (!from.unit) return { ...line, price: { kind: "last_paid", minor: paid, currency: from.currency, from } };
    const bought = toBase(from.quantity, from.unit);
    const wanted = toBase(line.quantity, line.unit);
    if (bought.unit !== wanted.unit || !(bought.quantity > 0)) return { ...line, price: { kind: "last_paid", minor: paid, currency: from.currency, from } };
    const perBaseMinor = paid / bought.quantity;
    return {
      ...line,
      price: { kind: "estimate", minor: Math.round(perBaseMinor * wanted.quantity), currency: from.currency, perBaseMinor: roundQuantity(perBaseMinor), baseUnit: wanted.unit, from },
    };
  });
  const totals = new Map<string, CartTotal>();
  for (const line of lines) {
    if (line.price.kind !== "estimate") continue;
    const total = totals.get(line.price.currency) ?? { currency: line.price.currency, minor: 0, lines: 0 };
    total.minor += line.price.minor;
    total.lines += 1;
    totals.set(line.price.currency, total);
  }
  const priced = lines.filter((line) => line.price.kind === "estimate").length;
  return { lines, totals: [...totals.values()], priced, unpriced: lines.length - priced };
}

/**
 * What a cart line's price is per the unit a person buys it in — "₹60 a kg",
 * "₹56 a litre", "₹7 each" — from the per-base-unit price.
 */
export function pricePer(perBaseMinor: number, baseUnit: string): { minor: number; per: "kg" | "l" | "pc" | string } {
  if (baseUnit === "g") return { minor: Math.round(perBaseMinor * 1000), per: "kg" };
  if (baseUnit === "ml") return { minor: Math.round(perBaseMinor * 1000), per: "l" };
  if (baseUnit === "pcs") return { minor: Math.round(perBaseMinor), per: "pc" };
  return { minor: Math.round(perBaseMinor), per: baseUnit };
}
