/**
 * A usual day's hours — when school starts and ends for a child, or when an
 * adult's working day does — on the household's own clock.
 *
 * Kept as "HH:MM" (what a time field sends and what Postgres `time` reads
 * back, less its seconds). Both or neither: a start with no end says nothing
 * HomePlaces can use, so a half-filled pair is refused rather than half kept.
 */

export type DayHours = { starts: string; ends: string };

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/** "15:30" or "15:30:00" → minutes past midnight; anything else → null. */
export function minuteOf(value: string | null | undefined): number | null {
  const match = CLOCK.exec((value ?? "").trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "15:30:00" → "15:30". */
function hhmm(value: string): string {
  return value.trim().slice(0, 5);
}

/** A stored pair, read back. Anything unreadable is treated as not on record. */
export function hoursFromRow(starts: string | null | undefined, ends: string | null | undefined): DayHours | null {
  if (minuteOf(starts) === null || minuteOf(ends) === null) return null;
  return { starts: hhmm(starts!), ends: hhmm(ends!) };
}

export type HoursInput =
  | { ok: true; hours: DayHours | null }
  | { ok: false; problem: "half" | "unreadable" | "same" | "ends_first" };

/**
 * What a form sent: two blanks clear the hours; one blank is a question back.
 * `overnight` allows an end before the start (a night shift); a school day
 * never runs past midnight.
 */
export function readHoursInput(starts: unknown, ends: unknown, options: { overnight: boolean }): HoursInput {
  const start = typeof starts === "string" ? starts.trim() : "";
  const end = typeof ends === "string" ? ends.trim() : "";
  if (!start && !end) return { ok: true, hours: null };
  if (!start || !end) return { ok: false, problem: "half" };
  const from = minuteOf(start);
  const to = minuteOf(end);
  if (from === null || to === null) return { ok: false, problem: "unreadable" };
  if (from === to) return { ok: false, problem: "same" };
  if (to < from && !options.overnight) return { ok: false, problem: "ends_first" };
  return { ok: true, hours: { starts: hhmm(start), ends: hhmm(end) } };
}

/** The plain-English reason a pair was refused, for the English-only forms. */
export const HOURS_PROBLEM: Record<Exclude<HoursInput, { ok: true }>["problem"], string> = {
  half: "Give both a start and an end time, or leave both blank.",
  unreadable: "Use a time like 09:00.",
  same: "The start and end can't be the same time.",
  ends_first: "The end time needs to be after the start.",
};

/**
 * "9:30 am – 6:00 pm", through the reader's own time formatter (their
 * language and 12/24-hour choice); pass one made for UTC, since these are
 * clock times rather than instants.
 */
export function hoursLabel(hours: DayHours, time: (value: Date) => string): string {
  const at = (value: string) => {
    const minute = minuteOf(value) ?? 0;
    return time(new Date(Date.UTC(1970, 0, 1, Math.floor(minute / 60), minute % 60)));
  };
  return `${at(hours.starts)} – ${at(hours.ends)}`;
}
