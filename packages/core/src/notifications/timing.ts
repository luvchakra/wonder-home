/**
 * Clock arithmetic for reminders, always in the household's own time zone.
 *
 * The notification engine used to read quiet hours with `getUTCHours()`, so a
 * family in Kolkata whose quiet hours began at 22:00 was left alone from
 * 03:30 their time instead. Every decision here takes the zone explicitly;
 * nothing reads the server's clock face.
 */

export type LocalMoment = {
  /** `YYYY-MM-DD` as the household's own calendar reads it. */
  dateKey: string;
  hour: number;
  minute: number;
  /** Minutes since local midnight, 0–1439. */
  minuteOfDay: number;
  /** 0 = Sunday, as `Date#getDay`. */
  weekday: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The household's clock face at an instant. An unknown zone reads as UTC rather than throwing. */
export function localMoment(at: Date, timeZone: string): LocalMoment {
  const zone = isTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** A wall-clock time on a local date, as an instant — correct across daylight-saving changes. */
export function atLocal(dateKey: string, minuteOfDay: number, timeZone: string): Date {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const naive = Date.parse(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`);
  // Guess, then correct by the zone's own offset at that guess — twice, so a
  // guess that lands on the other side of a DST change still settles.
  let guess = naive;
  for (let pass = 0; pass < 2; pass += 1) {
    const seen = localMoment(new Date(guess), timeZone);
    const seenAsUtc = Date.parse(`${seen.dateKey}T${String(seen.hour).padStart(2, "0")}:${String(seen.minute).padStart(2, "0")}:00.000Z`);
    guess += naive - seenAsUtc;
  }
  return new Date(guess);
}

/** The local date `days` away from `dateKey` (negative for earlier). */
export function shiftDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type QuietHours = {
  /** Minutes since local midnight the quiet begins. */
  fromMinute: number;
  /** Minutes since local midnight it ends. Equal to `fromMinute` means no quiet at all. */
  untilMinute: number;
};

/** Quiet hours may wrap midnight, which is the normal case. */
export function inQuietHours(at: Date, quiet: QuietHours, timeZone: string): boolean {
  if (quiet.fromMinute === quiet.untilMinute) return false;
  const minute = localMoment(at, timeZone).minuteOfDay;
  return quiet.fromMinute < quiet.untilMinute
    ? minute >= quiet.fromMinute && minute < quiet.untilMinute
    : minute >= quiet.fromMinute || minute < quiet.untilMinute;
}

/** When the quiet that `at` falls in ends; `at` itself when it is not quiet. */
export function endOfQuiet(at: Date, quiet: QuietHours, timeZone: string): Date {
  if (!inQuietHours(at, quiet, timeZone)) return at;
  const local = localMoment(at, timeZone);
  const sameDay = atLocal(local.dateKey, quiet.untilMinute, timeZone);
  return sameDay > at ? sameDay : atLocal(shiftDate(local.dateKey, 1), quiet.untilMinute, timeZone);
}

/** Whole hours (the stored shape) plus optional minutes, as a quiet window — or none when either end is unset. */
export function quietHoursFrom(input: {
  quietFrom: number | null;
  quietUntil: number | null;
  quietFromMinute?: number | null;
  quietUntilMinute?: number | null;
}): QuietHours | null {
  if (input.quietFrom === null || input.quietUntil === null) return null;
  return {
    fromMinute: input.quietFrom * 60 + (input.quietFromMinute ?? 0),
    untilMinute: input.quietUntil * 60 + (input.quietUntilMinute ?? 0),
  };
}
