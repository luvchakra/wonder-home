/**
 * Repeat rules for family events (story 12-009, design §3.1–§3.2).
 *
 * A deliberately small subset — daily, weekly (on chosen weekdays), monthly
 * and yearly, every N, until a date or for a count — mirrored exactly by the
 * database's `wh.valid_recurrence`. Occurrences are expanded per requested
 * range and never stored, so a series cannot blow up a table.
 *
 * Occurrences keep their local wall-clock time: a 7 pm weekly dinner is at
 * 7 pm on both sides of a daylight-saving change. A monthly event on the 31st
 * skips months without one, and a yearly event on 29 February happens in leap
 * years only — nothing is quietly moved to a different day.
 */
import {
  addMonths,
  atLocal,
  dateKeyOf,
  daysBetween,
  isDateKey,
  isRealDate,
  localMoment,
  partsOf,
  shiftDate,
  startOfWeek,
} from "./dates";

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export type RecurrenceRule = {
  freq: RecurrenceFrequency;
  interval?: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday. Defaults to the first occurrence's weekday. */
  byWeekday?: number[];
  /** Last local date an occurrence may fall on. */
  until?: string;
  /** How many occurrences in all, counted from the first. */
  count?: number;
};

const KEYS = new Set(["freq", "interval", "byWeekday", "until", "count"]);

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** A stored or submitted rule, or null when it is not one this subset allows. */
export function parseRecurrence(value: unknown): RecurrenceRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !KEYS.has(key))) return null;
  if (!RECURRENCE_FREQUENCIES.includes(raw.freq as RecurrenceFrequency)) return null;
  const rule: RecurrenceRule = { freq: raw.freq as RecurrenceFrequency };
  if (raw.interval !== undefined) {
    if (!isWhole(raw.interval, 1, 99)) return null;
    rule.interval = raw.interval;
  }
  if (raw.count !== undefined) {
    if (!isWhole(raw.count, 1, 500)) return null;
    rule.count = raw.count;
  }
  if (raw.until !== undefined) {
    if (!isDateKey(raw.until)) return null;
    rule.until = raw.until;
  }
  if (rule.count !== undefined && rule.until !== undefined) return null;
  if (raw.byWeekday !== undefined) {
    if (rule.freq !== "weekly" || !Array.isArray(raw.byWeekday)) return null;
    const days = raw.byWeekday;
    if (days.length < 1 || days.length > 7 || !days.every((day) => isWhole(day, 0, 6))) return null;
    rule.byWeekday = [...new Set(days as number[])].sort((a, b) => a - b);
  }
  return rule;
}

export type SeriesInput = {
  start: Date;
  end: Date;
  allDay: boolean;
  timeZone: string;
  rule: RecurrenceRule | null;
};

export type OccurrenceException = {
  occurrenceDate: string;
  cancelled: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  title?: string | null;
  location?: string | null;
};

export type Occurrence = {
  /** The local date the rule gives this occurrence; it identifies it even when moved. */
  occurrenceDate: string;
  start: Date;
  end: Date;
  /** Present when this one occurrence was changed. */
  exception?: OccurrenceException;
};

/** The most occurrences a single range may produce: a daily event across a year. */
export const MAX_OCCURRENCES_PER_RANGE = 400;

/**
 * The occurrences of an event that touch the local days `from`–`to`
 * (inclusive). A one-off event is its own single occurrence.
 */
export function expandSeries(
  series: SeriesInput,
  range: { from: string; to: string },
  exceptions: readonly OccurrenceException[] = [],
): Occurrence[] {
  const first = localMoment(series.start, series.timeZone);
  const lastDay = localMoment(new Date(series.end.getTime() - (series.allDay ? 1 : 0)), series.timeZone).dateKey;
  const spanDays = Math.max(0, daysBetween(first.dateKey, lastDay));
  const durationMs = series.end.getTime() - series.start.getTime();
  const byDate = new Map(exceptions.map((exception) => [exception.occurrenceDate, exception]));

  const make = (occurrenceDate: string): Occurrence | null => {
    const exception = byDate.get(occurrenceDate);
    if (exception?.cancelled) return null;
    let start: Date;
    let end: Date;
    if (exception?.startsAt && exception.endsAt) {
      start = exception.startsAt;
      end = exception.endsAt;
    } else if (series.allDay) {
      start = atLocal(occurrenceDate, 0, series.timeZone);
      end = atLocal(shiftDate(occurrenceDate, spanDays + 1), 0, series.timeZone);
    } else {
      start = atLocal(occurrenceDate, first.minuteOfDay, series.timeZone);
      end = new Date(start.getTime() + durationMs);
    }
    return exception ? { occurrenceDate, start, end, exception } : { occurrenceDate, start, end };
  };

  const touches = (occurrence: Occurrence): boolean => {
    const startDay = localMoment(occurrence.start, series.timeZone).dateKey;
    const endDay = localMoment(new Date(occurrence.end.getTime() - 1), series.timeZone).dateKey;
    return startDay <= range.to && endDay >= range.from;
  };

  if (!series.rule) {
    const only = make(first.dateKey);
    return only && touches(only) ? [only] : [];
  }

  const rule = series.rule;
  const interval = rule.interval ?? 1;
  const out: Occurrence[] = [];
  let produced = 0;

  // Without a count, whole periods that end before the range can be skipped;
  // with one, every occurrence from the first has to be counted.
  const lead = Math.max(0, daysBetween(first.dateKey, range.from) - spanDays);
  const { year: y0, month: m0, day: d0 } = partsOf(first.dateKey);
  let period = 0;
  if (rule.count === undefined && lead > 0) {
    if (rule.freq === "daily") period = Math.floor(lead / interval);
    else if (rule.freq === "weekly") period = Math.max(0, Math.floor(lead / (7 * interval)) - 1);
    else if (rule.freq === "monthly") period = Math.max(0, Math.floor(lead / 31 / interval) - 1);
    else period = Math.max(0, Math.floor(lead / 366 / interval) - 1);
  }

  const weekdays = rule.byWeekday ?? [first.weekday];
  const firstWeek = startOfWeek(first.dateKey, 0);

  for (let guard = 0; guard < 5000; guard += 1, period += 1) {
    let candidates: string[];
    switch (rule.freq) {
      case "daily":
        candidates = [shiftDate(first.dateKey, period * interval)];
        break;
      case "weekly": {
        const weekStart = shiftDate(firstWeek, period * interval * 7);
        candidates = weekdays.map((weekday) => shiftDate(weekStart, weekday)).filter((key) => key >= first.dateKey);
        break;
      }
      case "monthly": {
        const { year, month } = addMonths(y0, m0, period * interval);
        candidates = isRealDate(year, month, d0) ? [dateKeyOf(year, month, d0)] : [];
        break;
      }
      case "yearly": {
        const year = y0 + period * interval;
        candidates = isRealDate(year, m0, d0) ? [dateKeyOf(year, m0, d0)] : [];
        break;
      }
    }

    for (const date of candidates) {
      if (rule.until && date > rule.until) return out;
      if (rule.count !== undefined && produced >= rule.count) return out;
      if (date > range.to) return out;
      produced += 1;
      const occurrence = make(date);
      if (occurrence && touches(occurrence)) {
        out.push(occurrence);
        if (out.length >= MAX_OCCURRENCES_PER_RANGE) return out;
      }
    }
  }
  return out;
}

