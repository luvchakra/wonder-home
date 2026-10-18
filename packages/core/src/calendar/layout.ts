/**
 * Where timed entries sit on a day's time grid (story 12-009, design §4 "Day").
 *
 * Overlapping entries sit side by side in columns rather than on top of each
 * other, so every title stays readable (rule 15). An entry that starts before
 * the grid's first hour or runs past its last is clamped to the edge and says
 * so through `clippedStart`/`clippedEnd`, so the screen can show its real time.
 */
import { atLocal, localMoment, shiftDate } from "./dates";
import type { CalendarEntry } from "./projection";

export type PlacedEntry = {
  entry: CalendarEntry;
  /** Minutes from the grid's first hour. */
  top: number;
  /** Minutes tall, at least `minMinutes`. */
  height: number;
  column: number;
  columns: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

export type DayGridOptions = { startHour: number; endHour: number; minMinutes?: number };

export const DAY_GRID: DayGridOptions = { startHour: 6, endHour: 23, minMinutes: 30 };

/** The hours a day grid draws, widened to take in anything that falls outside 6 am – 11 pm on this day. */
export function gridHoursFor(entries: readonly CalendarEntry[], day: string, timeZone: string, base: DayGridOptions = DAY_GRID): DayGridOptions {
  let { startHour, endHour } = base;
  for (const entry of entries) {
    if (entry.allDay || !entry.end) continue;
    const start = localMoment(entry.start, timeZone);
    const end = localMoment(entry.end, timeZone);
    if (start.dateKey === day) startHour = Math.min(startHour, start.hour);
    if (end.dateKey === day) endHour = Math.max(endHour, end.minute > 0 ? end.hour + 1 : end.hour);
  }
  return { ...base, startHour, endHour: Math.min(24, endHour) };
}

export function layoutDay(entries: readonly CalendarEntry[], day: string, timeZone: string, options: DayGridOptions = DAY_GRID): PlacedEntry[] {
  const gridStart = atLocal(day, options.startHour * 60, timeZone).getTime();
  const gridEnd = (options.endHour >= 24 ? atLocal(shiftDate(day, 1), 0, timeZone) : atLocal(day, options.endHour * 60, timeZone)).getTime();
  const minMinutes = options.minMinutes ?? 30;
  const total = (gridEnd - gridStart) / 60_000;

  const timed = entries
    .filter((entry) => !entry.allDay && entry.kind === "block" && entry.end && entry.end.getTime() > gridStart && entry.start.getTime() < gridEnd)
    .map((entry) => {
      const start = Math.max(entry.start.getTime(), gridStart);
      const end = Math.min(entry.end!.getTime(), gridEnd);
      const top = (start - gridStart) / 60_000;
      const height = Math.min(Math.max((end - start) / 60_000, minMinutes), total - top);
      return { entry, top, height, clippedStart: entry.start.getTime() < gridStart, clippedEnd: entry.end!.getTime() > gridEnd };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  // Group entries that overlap, directly or through each other, then give each
  // group's entries the first free column.
  const placed: PlacedEntry[] = [];
  let group: (typeof timed[number] & { column: number })[] = [];
  let groupEnd = -1;
  const flush = () => {
    const columns = Math.max(1, ...group.map((item) => item.column + 1));
    for (const item of group) placed.push({ ...item, columns });
    group = [];
  };
  for (const item of timed) {
    if (group.length > 0 && item.top >= groupEnd) flush();
    const taken = new Set(group.filter((other) => other.top + other.height > item.top).map((other) => other.column));
    let column = 0;
    while (taken.has(column)) column += 1;
    group.push({ ...item, column });
    groupEnd = Math.max(groupEnd, item.top + item.height);
  }
  if (group.length > 0) flush();
  return placed;
}
