import type { MealSlot } from "./meals";
import { shiftDay, weekDays } from "./week";

/**
 * The week template (the owner, 2026-10-20: "create a week template with
 * multiple options per slot. for each week let WonderHome select the weekly
 * meal plan and show to you, if required user can make change or its
 * accepted by default").
 *
 * A household lists, for a weekday's slot, the recipes that may go there.
 * Each week WonderHome picks one per slot. The pick is deterministic: it
 * rotates through the slot's options week by week, never repeats last
 * week's dish in the same slot when there is another, and never picks a dish
 * the household's own rules rule out (an allergy, a diet). The picks are
 * planned as ordinary meals at once — accepted by default — into slots still
 * empty and not past; nothing a person planned is moved or replaced.
 */

/** 1 = Monday … 7 = Sunday, the ISO weekday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export type TemplateOption = {
  id: string;
  weekday: Weekday;
  slot: MealSlot;
  recipeId: string;
  name: string;
  position: number;
};

export type WeekPick = { onDate: string; weekday: Weekday; slot: MealSlot; recipeId: string; name: string; optionId: string };

/** The ISO weekday of a date written `2026-10-20`. */
export function weekdayOf(iso: string): Weekday {
  return (((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1) as Weekday;
}

/** Weeks since 1970-01-05, the first Monday: the turn of the rotation. */
export function weekNumber(weekStart: string): number {
  return Math.floor((Date.parse(`${weekStart}T00:00:00Z`) - Date.parse("1970-01-05T00:00:00Z")) / (7 * 86_400_000));
}

/** A slot's options in the order the household put them. */
export function optionsFor(options: readonly TemplateOption[], weekday: Weekday, slot: MealSlot): TemplateOption[] {
  return options
    .filter((option) => option.weekday === weekday && option.slot === slot)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * The one option for a slot this week: the rotation's turn, stepping past a
 * dish the household rules out, and past last week's dish while another is
 * left. Null when no option can go there.
 */
export function pickFor(input: {
  options: readonly TemplateOption[];
  weekday: Weekday;
  slot: MealSlot;
  weekStart: string;
  lastWeek?: string | null;
  blocked?: ReadonlySet<string>;
}): TemplateOption | null {
  const allowed = optionsFor(input.options, input.weekday, input.slot).filter((option) => !input.blocked?.has(option.recipeId));
  if (allowed.length === 0) return null;
  const start = ((weekNumber(input.weekStart) % allowed.length) + allowed.length) % allowed.length;
  for (let step = 0; step < allowed.length; step += 1) {
    const option = allowed[(start + step) % allowed.length]!;
    if (allowed.length === 1 || option.recipeId !== input.lastWeek) return option;
  }
  return allowed[start]!;
}

/**
 * WonderHome's plan for a week: one pick per slot that has options, only
 * where the slot is still empty and its day is not past.
 */
export function proposeWeek(input: {
  weekStart: string;
  options: readonly TemplateOption[];
  taken: readonly { onDate: string; slot: MealSlot }[];
  lastWeek: readonly { onDate: string; slot: MealSlot; recipeId: string | null }[];
  today: string;
  blocked?: ReadonlySet<string>;
}): WeekPick[] {
  const taken = new Set(input.taken.map((meal) => `${meal.onDate}:${meal.slot}`));
  const picks: WeekPick[] = [];
  for (const onDate of weekDays(input.weekStart)) {
    if (onDate < input.today) continue;
    const weekday = weekdayOf(onDate);
    const slots = [...new Set(input.options.filter((option) => option.weekday === weekday).map((option) => option.slot))];
    for (const slot of slots) {
      if (taken.has(`${onDate}:${slot}`)) continue;
      const before = shiftDay(onDate, -7);
      const lastWeek = input.lastWeek.find((meal) => meal.onDate === before && meal.slot === slot)?.recipeId ?? null;
      const option = pickFor({ options: input.options, weekday, slot, weekStart: input.weekStart, lastWeek, blocked: input.blocked });
      if (!option) continue;
      picks.push({ onDate, weekday, slot, recipeId: option.recipeId, name: option.name, optionId: option.id });
    }
  }
  return picks.sort((a, b) => a.onDate.localeCompare(b.onDate) || SLOT_RANK[a.slot] - SLOT_RANK[b.slot]);
}

const SLOT_RANK: Record<MealSlot, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

/** "Choose again": the slot's next option after the one planned, or null when it has no other. */
export function nextOption(input: { options: readonly TemplateOption[]; weekday: Weekday; slot: MealSlot; current: string | null; blocked?: ReadonlySet<string> }): TemplateOption | null {
  const allowed = optionsFor(input.options, input.weekday, input.slot).filter((option) => !input.blocked?.has(option.recipeId));
  const others = allowed.filter((option) => option.recipeId !== input.current);
  if (others.length === 0) return null;
  const at = allowed.findIndex((option) => option.recipeId === input.current);
  if (at < 0) return others[0]!;
  return allowed[(at + 1) % allowed.length]!;
}

/** Which days an option is added to: one weekday, or every day, weekdays or the weekend at once. */
export type DayChoice = Weekday | "every" | "weekdays" | "weekend";
export function daysOf(choice: DayChoice): Weekday[] {
  if (choice === "every") return [...WEEKDAYS];
  if (choice === "weekdays") return [1, 2, 3, 4, 5];
  if (choice === "weekend") return [6, 7];
  return [choice];
}
