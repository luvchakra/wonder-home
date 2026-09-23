/**
 * When a school item happens, as a household says it (story 14-014): a day,
 * and — only when somebody actually gave one — a local start time and an
 * end. An all-day item keeps the long-standing convention of midnight UTC on
 * its day (`isoDate(dueAt)` reads the day back) and says it has no time, so
 * no screen ever shows a time nobody gave. A timed item is the real instant
 * in the household's timezone.
 */

export type SchoolWhen = { dueAt: string | null; dueTimeKnown: boolean; endsAt: string | null };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function zoneParts(at: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") === 24 ? 0 : get("hour"), minute: get("minute") };
}

/** A wall-clock day and time in `timeZone`, as a UTC instant — guessed, then corrected by the zone's own offset, so it holds across DST. */
export function localInstant(date: string, time: string, timeZone: string): string | null {
  const day = DATE.exec(date);
  const clock = TIME.exec(time);
  if (!day || !clock) return null;
  const naive = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), Number(clock[1]), Number(clock[2]));
  try {
    const seen = zoneParts(new Date(naive), timeZone);
    const offset = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) - naive;
    return new Date(naive - offset).toISOString();
  } catch {
    return null;
  }
}

/**
 * The stored shape of "when": a date with no time is all-day; a time without
 * a date decides nothing (a time never invents a day); an end that is not
 * after the start is dropped rather than stored as nonsense.
 */
export function schoolWhen(input: { date?: string | null; time?: string | null; endTime?: string | null; timezone: string }): SchoolWhen {
  const date = input.date?.trim() ?? "";
  if (!DATE.test(date)) return { dueAt: null, dueTimeKnown: false, endsAt: null };
  const start = input.time?.trim() ? localInstant(date, input.time.trim(), input.timezone) : null;
  if (!start) return { dueAt: `${date}T00:00:00.000Z`, dueTimeKnown: false, endsAt: null };
  const end = input.endTime?.trim() ? localInstant(date, input.endTime.trim(), input.timezone) : null;
  return { dueAt: start, dueTimeKnown: true, endsAt: end && end > start ? end : null };
}

/** "HH:MM" in the household's timezone, for a time input's value. */
export function localTimeValue(at: Date | null, timeZone: string): string {
  if (!at) return "";
  try {
    const { hour, minute } = zoneParts(at, timeZone);
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

/** "YYYY-MM-DD" for a date input: the local day of a timed item, the stored day of an all-day one. */
export function schoolDateValue(item: { dueAt: Date | null; dueTimeKnown: boolean }, timeZone: string): string {
  if (!item.dueAt) return "";
  if (!item.dueTimeKnown) return item.dueAt.toISOString().slice(0, 10);
  try {
    const { year, month, day } = zoneParts(item.dueAt, timeZone);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } catch {
    return item.dueAt.toISOString().slice(0, 10);
  }
}

/**
 * Moving an item to another day keeps what was known about its time: a
 * timed item keeps its local start (and its length, when it had an end); an
 * all-day item stays all-day.
 */
export function movedSchoolWhen(previous: { dueAt: Date | null; dueTimeKnown: boolean; endsAt: Date | null }, date: string, timeZone: string): SchoolWhen {
  if (!previous.dueAt || !previous.dueTimeKnown) return schoolWhen({ date, timezone: timeZone });
  const moved = schoolWhen({ date, time: localTimeValue(previous.dueAt, timeZone), timezone: timeZone });
  if (!moved.dueAt || !previous.endsAt) return moved;
  const length = previous.endsAt.getTime() - previous.dueAt.getTime();
  return { ...moved, endsAt: length > 0 ? new Date(new Date(moved.dueAt).getTime() + length).toISOString() : null };
}

/**
 * The zone to read an item's day in: the household's for a timed item, UTC
 * for an all-day one (its instant is midnight UTC on the day it names — read
 * in, say, Los Angeles, that is the evening before).
 */
export function schoolDayZone(item: { dueTimeKnown: boolean }, timeZone: string): string {
  return item.dueTimeKnown ? timeZone : "UTC";
}

/** "9:00 AM" or "9:00 AM – 11:00 AM" — only when somebody gave a time; null for an all-day item. */
export function schoolTimeWords(item: { dueAt: Date | null; dueTimeKnown: boolean; endsAt: Date | null }, timeZone: string): string | null {
  if (!item.dueAt || !item.dueTimeKnown) return null;
  const format = (at: Date) => {
    try {
      return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(at);
    } catch {
      return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(at);
    }
  };
  return item.endsAt ? `${format(item.dueAt)} – ${format(item.endsAt)}` : format(item.dueAt);
}
