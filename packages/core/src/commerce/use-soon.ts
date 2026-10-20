import type { GroceryItem } from "./inventory";
import { stockStatus } from "./inventory";

/**
 * What the Use soon view says, and what it will not say (story 25-003c,
 * design/GROCERIES-PANTRY-HOMETALK-PHASE0.md §3.6).
 *
 * Two groups, never mixed:
 *
 * - **Use first**: an item with a date someone *knows* — printed on the pack or
 *   entered by a person — with that basis said. A date that is only an estimate
 *   is not a use-by date, so it is never listed here and never turned into a
 *   suggestion to eat something. A date that has passed says so and tells the
 *   person to check it, never "still fine".
 * - **Running low**: at or below the level the household set, with how the
 *   amount is known said plainly: counted by a person, or worked out from what
 *   was bought and used. An amount nobody has counted for a long time is said
 *   to be old, not current.
 *
 * Pure: the page hands it the items and today's date on the household's clock.
 */

export type DateState = "passed" | "today" | "soon" | "later";
export type UseFirstEntry = {
  item: GroceryItem;
  useBy: string;
  basis: "printed" | "entered";
  /** Whether the amount at home was counted by a person or worked out. */
  knowledge: StockKnowledge;
  /** Whole days from today: negative once it has passed. */
  days: number;
  state: DateState;
};

/** How an amount at home came to be on record. */
export type StockKnowledge = "counted" | "worked_out";
export type RunningEntry = {
  item: GroceryItem;
  status: "low" | "none";
  knowledge: StockKnowledge;
  /** The day it was last confirmed or changed, on the household's clock. */
  asOf: string;
  /** Not confirmed for a month or more: said to be old. */
  old: boolean;
};

/** A date within this many days is "soon". */
export const SOON_DAYS = 3;
/** An amount not confirmed for this long is old. */
export const OLD_AFTER_DAYS = 30;

const COUNTED_SOURCES = new Set(["stated", "correction", "undo"]);

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The local day a stored instant falls on. */
function dayOf(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(instant));
}

export function useSoon(items: readonly GroceryItem[], today: string, timeZone: string): { useFirst: UseFirstEntry[]; running: RunningEntry[]; estimatedHidden: number } {
  const useFirst: UseFirstEntry[] = [];
  let estimatedHidden = 0;
  for (const item of items) {
    const stock = item.stock;
    if (!stock?.useBy || stock.quantity <= 0) continue;
    if (stock.useByBasis !== "printed" && stock.useByBasis !== "entered") {
      estimatedHidden += 1;
      continue;
    }
    const days = daysBetween(today, stock.useBy);
    useFirst.push({ item, useBy: stock.useBy, basis: stock.useByBasis, knowledge: COUNTED_SOURCES.has(stock.source) ? "counted" : "worked_out", days, state: days < 0 ? "passed" : days === 0 ? "today" : days <= SOON_DAYS ? "soon" : "later" });
  }
  useFirst.sort((a, b) => a.useBy.localeCompare(b.useBy) || a.item.name.localeCompare(b.item.name));

  const running: RunningEntry[] = [];
  for (const item of items) {
    const status = stockStatus(item);
    if (!item.stock || !(status === "low" || (status === "none" && item.lowLevel !== null))) continue;
    const asOf = dayOf(item.stock.confirmedAt, timeZone);
    running.push({
      item,
      status: status === "none" ? "none" : "low",
      knowledge: COUNTED_SOURCES.has(item.stock.source) ? "counted" : "worked_out",
      asOf,
      old: daysBetween(asOf, today) >= OLD_AFTER_DAYS,
    });
  }
  // Out first, then the oldest count: the ones least known are the ones to look at.
  running.sort((a, b) => Number(b.status === "none") - Number(a.status === "none") || a.asOf.localeCompare(b.asOf) || a.item.name.localeCompare(b.item.name));
  return { useFirst, running, estimatedHidden };
}
