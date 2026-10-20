import type { MealSlot } from "./meals";

/**
 * The week a household plans its meals in (the owner, 2026-10-20: "design
 * this in a way that weekly meal planning can be done"). A week runs Monday
 * to Sunday on the household's own calendar; every day shows its three
 * everyday slots, breakfast, lunch and dinner, so an empty one is a place to
 * plan rather than a gap nobody sees. A snack shows only when one is planned.
 *
 * "Repeat last week" copies last week's meals a week on, each into the same
 * day and slot, and only into slots still empty and not yet past — it never
 * moves or replaces a meal already planned.
 */

export const WEEK_SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "dinner"];

/** When each slot is usually ready, for a meal planned straight into it. */
export const SLOT_READY_BY: Record<MealSlot, string> = { breakfast: "08:30", lunch: "13:30", snack: "17:00", dinner: "20:00" };

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const shiftDay = (iso: string, days: number) => new Date(at(iso) + days * DAY).toISOString().slice(0, 10);

/** The Monday of the week a day falls in. */
export function weekStartOf(iso: string): string {
  const weekday = (new Date(at(iso)).getUTCDay() + 6) % 7;
  return shiftDay(iso, -weekday);
}

/** A week asked for in the address (`?week=2026-10-19`): any day in it, or the current week when absent or unreadable. */
export function weekFrom(param: string | undefined, today: string): string {
  return param && /^\d{4}-\d{2}-\d{2}$/.test(param) && !Number.isNaN(at(param)) ? weekStartOf(param) : weekStartOf(today);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftDay(start, index));
}

/**
 * How many everyday slots are planned out of those still to come — the
 * honest count beside the week (rule 9). A day already gone counts only for
 * what was planned on it.
 */
export function weekCount(days: readonly string[], meals: readonly { onDate: string; slot: MealSlot }[], today: string): { planned: number; total: number } {
  let planned = 0;
  let total = 0;
  for (const day of days) {
    for (const slot of WEEK_SLOTS) {
      const has = meals.some((meal) => meal.onDate === day && meal.slot === slot);
      if (day < today && !has) continue;
      total += 1;
      if (has) planned += 1;
    }
  }
  return { planned, total };
}

export type CopySource = { id: string; name: string; slot: MealSlot; onDate: string; readyBy: Date; cookMemberId: string | null; recipeId: string | null };

/** What "Repeat last week" would plan: each of last week's meals a week on, into a slot still empty and not past. */
export function copyLastWeek(input: { from: readonly CopySource[]; taken: readonly { onDate: string; slot: MealSlot }[]; today: string }): (CopySource & { sourceId: string })[] {
  const taken = new Set(input.taken.map((meal) => `${meal.onDate}:${meal.slot}`));
  const out: (CopySource & { sourceId: string })[] = [];
  for (const meal of input.from) {
    const onDate = shiftDay(meal.onDate, 7);
    const key = `${onDate}:${meal.slot}`;
    if (onDate < input.today || taken.has(key)) continue;
    taken.add(key);
    out.push({ ...meal, sourceId: meal.id, onDate, readyBy: new Date(meal.readyBy.getTime() + 7 * DAY) });
  }
  return out;
}
