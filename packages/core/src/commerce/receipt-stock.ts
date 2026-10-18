import type { GroceryItem } from "./inventory";
import { addAmounts, compatible, normalizeUnit, subtractAmounts, toBase, type Amount } from "./units";

/**
 * What a kept receipt line does to what is at home and to the list
 * (HomeFood 25-003b, design GROCERIES-PANTRY-HOMETALK-PHASE0.md §3.8 and §6).
 *
 * Pure: the review shows it line by line as the person edits, and the server
 * works it out again from what is on record before anything is written.
 *
 * - **Add to stock** is on by default when the amount converts to the item's
 *   unit. It is off when somebody counted the item *after* the receipt's day
 *   (a count a person stated or corrected, not a purchase or an undo):
 *   that count already includes what was bought, and adding it again would
 *   claim stock nobody has. The person can still tick it.
 * - **Clears list entry** is on by default when the item is waiting on the
 *   list. The bought amount comes off it; what is left stays to buy.
 * - Never a cross-dimension guess: "1 pack" of an item kept in grams adds
 *   nothing, and says why.
 */

export type ReceiptLineInput = {
  /** What the line says was bought; empty means one. */
  quantity: number | null;
  /** The line's unit as written or picked; empty means the item's own. */
  unit: string | null;
};

export type ReceiptStockLine = {
  /** The amount bought in the item's base unit, or null when it does not convert. */
  bought: Amount | null;
  /** What is at home now; null when nobody has said. */
  before: Amount | null;
  /** What is at home once it is added; null when it cannot be. */
  after: Amount | null;
  /** Whether the amount can be added to stock at all. */
  addable: boolean;
  /** Somebody counted the item after the receipt's day. */
  countedAfter: string | null;
  addByDefault: boolean;
  /** What is waiting on the list for this item. */
  onList: Amount | null;
  /** What stays on the list once the bought amount comes off it. */
  listAfter: Amount | null;
  /** Whether the bought amount can come off the list (an entry, in a unit that converts). */
  clearable: boolean;
};

/** The day part of an instant or a date, for comparing against a receipt's day. */
function dayOf(value: string): string {
  return value.slice(0, 10);
}

/** One line against the tracked item it is — or a new item (`null`), which starts at what was bought. */
export function receiptStockLine(line: ReceiptLineInput, item: GroceryItem | null, purchasedOn: string): ReceiptStockLine {
  const quantity = line.quantity && line.quantity > 0 ? line.quantity : 1;
  const unit = normalizeUnit(line.unit) ?? normalizeUnit(item?.unit) ?? "pcs";

  if (!item) {
    const bought = toBase(quantity, unit);
    return { bought, before: null, after: bought, addable: true, countedAfter: null, addByDefault: true, onList: null, listAfter: null, clearable: false };
  }

  const addable = compatible(unit, item.unit);
  const bought = addable ? toBase(quantity, unit) : null;
  const before = item.stock ? { quantity: item.stock.quantity, unit: item.stock.unit } : null;
  const after = bought ? (before ? addAmounts(before, bought) : bought) : null;
  // Only a person's own count says what was really there: a purchase, a
  // receipt or an undo moves the time on the row without anyone counting.
  const counted = item.stock && (item.stock.source === "stated" || item.stock.source === "correction");
  const confirmed = counted && item.stock!.confirmedAt ? dayOf(item.stock!.confirmedAt) : null;
  const countedAfter = confirmed && purchasedOn && confirmed > dayOf(purchasedOn) ? confirmed : null;

  const onList = item.toBuy ? { quantity: item.toBuy.quantity, unit: item.toBuy.unit } : null;
  const clearable = Boolean(onList && bought && compatible(bought.unit, onList.unit));
  const left = clearable ? subtractAmounts(onList!, bought!) : null;
  const listAfter = left ? { quantity: left.quantity, unit: left.unit } : null;

  return {
    bought,
    before,
    after,
    addable: Boolean(after),
    countedAfter,
    addByDefault: Boolean(after) && !countedAfter,
    onList,
    listAfter,
    clearable,
  };
}

export type RecordedReceipt = { id: string; merchant: string | null; purchasedOn: string | null; total: number | null; recordedAt: string };

/**
 * A receipt already recorded with the same shop, the same day and the same
 * total (§6): the same piece of paper sent twice, most likely. All three must
 * be known on both — a receipt with no total is never called a duplicate.
 */
export function duplicateReceipt(
  candidate: { id: string; merchant: string | null; purchasedOn: string | null; total: number | null },
  recorded: readonly RecordedReceipt[],
): RecordedReceipt | null {
  const shop = (value: string | null) => (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (!shop(candidate.merchant) || !candidate.purchasedOn || candidate.total == null) return null;
  return (
    recorded.find(
      (entry) =>
        entry.id !== candidate.id &&
        shop(entry.merchant) === shop(candidate.merchant) &&
        entry.purchasedOn != null &&
        dayOf(entry.purchasedOn) === dayOf(candidate.purchasedOn!) &&
        entry.total != null &&
        Math.abs(entry.total - candidate.total!) < 0.005,
    ) ?? null
  );
}
