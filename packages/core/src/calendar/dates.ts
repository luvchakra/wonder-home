/**
 * Local-date arithmetic for the Family Calendar (story 12-009).
 *
 * A calendar day is a `YYYY-MM-DD` key on the household's own clock, never a
 * server-clock Date. Instants are only made from a key through `atLocal`, so a
 * day is never shifted by the time zone the server happens to run in.
 */
import { atLocal, localMoment, shiftDate } from "../notifications/timing";

export { atLocal, localMoment, shiftDate };

export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return isRealDate(y, m, d);
}

export function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function dateKeyOf(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function partsOf(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** 0 = Sunday, as `Date#getDay`. */
export function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

/** The month `months` away, as {year, month}. */
export function addMonths(year: number, month: number, months: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The first day of the week holding `dateKey`, with weeks starting on `weekStartsOn` (0 Sunday, 1 Monday). */
export function startOfWeek(dateKey: string, weekStartsOn: number): string {
  const back = (weekdayOf(dateKey) - weekStartsOn + 7) % 7;
  return shiftDate(dateKey, -back);
}

/** Every key from `from` to `to`, both included. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let key = from; key <= to; key = shiftDate(key, 1)) days.push(key);
  return days;
}

/** The 6×7 grid a month view draws: whole weeks around the month. */
export function monthGrid(year: number, month: number, weekStartsOn: number): string[] {
  const first = startOfWeek(dateKeyOf(year, month, 1), weekStartsOn);
  return eachDay(first, shiftDate(first, 41));
}

/** Local midnight at the start of `from` to local midnight after `to`, as instants. */
export function rangeInstants(from: string, to: string, timeZone: string): { start: Date; end: Date } {
  return { start: atLocal(from, 0, timeZone), end: atLocal(shiftDate(to, 1), 0, timeZone) };
}

export type CalendarView = "month" | "week" | "day" | "year";
export const CALENDAR_VIEWS: readonly CalendarView[] = ["year", "month", "week", "day"];

/** The days a view shows around a focused date. */
export function viewRange(view: CalendarView, focus: string, weekStartsOn: number): { from: string; to: string } {
  const { year, month } = partsOf(focus);
  switch (view) {
    case "day":
      return { from: focus, to: focus };
    case "week": {
      const from = startOfWeek(focus, weekStartsOn);
      return { from, to: shiftDate(from, 6) };
    }
    case "month": {
      const grid = monthGrid(year, month, weekStartsOn);
      return { from: grid[0]!, to: grid[grid.length - 1]! };
    }
    case "year":
      return { from: dateKeyOf(year, 1, 1), to: dateKeyOf(year, 12, 31) };
  }
}

/** The date a ‹ or › step lands on, keeping the focused day where it can. */
export function stepFocus(view: CalendarView, focus: string, direction: 1 | -1): string {
  const { year, month, day } = partsOf(focus);
  switch (view) {
    case "day":
      return shiftDate(focus, direction);
    case "week":
      return shiftDate(focus, 7 * direction);
    case "month": {
      const next = addMonths(year, month, direction);
      return dateKeyOf(next.year, next.month, Math.min(day, daysInMonth(next.year, next.month)));
    }
    case "year": {
      const nextYear = year + direction;
      return dateKeyOf(nextYear, month, Math.min(day, daysInMonth(nextYear, month)));
    }
  }
}

/** One step further in (pinch out) or out (pinch in), keeping the focused date. */
export function zoomView(view: CalendarView, direction: "in" | "out"): CalendarView {
  const order: CalendarView[] = ["year", "month", "week", "day"];
  const index = order.indexOf(view) + (direction === "in" ? 1 : -1);
  return order[Math.max(0, Math.min(order.length - 1, index))]!;
}
