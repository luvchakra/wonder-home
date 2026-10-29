/**
 * Story 26-022 — turning an ICS date/time into an absolute instant.
 *
 * ICS dates come four ways: a date only (`VALUE=DATE`, an all-day event), a UTC
 * time (`...Z`), a time in a named zone (`TZID=America/New_York`), and a
 * "floating" time with neither — which means the reader's own local time. Full
 * VTIMEZONE parsing is out of scope for phase 1; a named zone is honoured when
 * it is a recognised IANA identifier (via `Intl`), and anything unrecognised or
 * floating is read in the household's own zone. Each event keeps the zone it was
 * read in, so the calendar shows it on the right day.
 */

export type WallTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export type IcsInstant = {
  /** The absolute moment the event starts. */
  start: Date;
  allDay: boolean;
  /** The IANA zone the event was read in (for display and recurrence), or "UTC". */
  timeZone: string;
  /** The wall-clock components in `timeZone`, for recurrence expansion. */
  wall: WallTime;
};

/** Whether a string is an IANA zone `Intl` recognises. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The offset (ms) of a zone from UTC at a given instant: wall-clock there minus the instant. */
function zoneOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
  return asUtc - at.getTime();
}

/**
 * The absolute instant for a wall-clock time in a zone. Resolves the DST
 * boundary by refining the offset once against the first guess.
 */
export function zonedWallTimeToUtc(wall: WallTime, tz: string): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const firstOffset = zoneOffsetMs(tz, new Date(guess));
  let utc = guess - firstOffset;
  const refined = zoneOffsetMs(tz, new Date(utc));
  if (refined !== firstOffset) utc = guess - refined;
  return new Date(utc);
}

const ICS_DATE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/;

/**
 * Parses one ICS date/time property into an instant, never throwing. Returns
 * null for a value it cannot read. `householdTimeZone` is the zone a floating
 * time or a date-only value is read in.
 */
export function parseIcsDateTime(
  prop: { value: string; params: Record<string, string> },
  householdTimeZone: string,
): IcsInstant | null {
  const match = ICS_DATE.exec(prop.value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const dateOnly = h === undefined || (prop.params.VALUE ?? "").toUpperCase() === "DATE";
  const zone = isValidTimeZone(householdTimeZone) ? householdTimeZone : "UTC";

  if (dateOnly) {
    const wall: WallTime = { year, month, day, hour: 0, minute: 0, second: 0 };
    return { start: zonedWallTimeToUtc(wall, zone), allDay: true, timeZone: zone, wall };
  }

  const wall: WallTime = { year, month, day, hour: Number(h), minute: Number(mi), second: Number(s) };
  if (z === "Z") {
    const start = new Date(Date.UTC(year, month - 1, day, wall.hour, wall.minute, wall.second));
    return { start, allDay: false, timeZone: "UTC", wall };
  }

  const tzid = prop.params.TZID;
  const eventZone = tzid && isValidTimeZone(tzid) ? tzid : zone;
  return { start: zonedWallTimeToUtc(wall, eventZone), allDay: false, timeZone: eventZone, wall };
}

/** The YYYY-MM-DD day an instant falls on in a zone — the key an occurrence and an EXDATE share. */
export function dateKeyInZone(at: Date, tz: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: isValidTimeZone(tz) ? tz : "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}
