/**
 * Story 26-022 — bounded RRULE expansion.
 *
 * Phase 1 expands the common rules — DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL,
 * COUNT, UNTIL and (for weekly) BYDAY — into single events inside the sync
 * window, capped. A rule it does not understand is reported unsupported, and
 * the caller imports just the first instance so nothing is silently dropped.
 * Everything is bounded: a cap on occurrences collected and a hard ceiling on
 * periods walked, so a hostile or runaway rule cannot spin.
 */

import { dateKeyInZone, zonedWallTimeToUtc, type WallTime } from "./time";

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type Rrule = {
  freq: Frequency;
  interval: number;
  count: number | null;
  until: Date | null;
  /** Weekdays 0 (Sunday) .. 6 (Saturday), for WEEKLY; else null. */
  byday: number[] | null;
};

/** The most occurrences one recurring event may import. */
export const MAX_OCCURRENCES = 200;
/** A hard ceiling on periods walked, so no rule can loop forever. */
const MAX_PERIODS = 20_000;

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const UNTIL_RE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/;

/** Parses an RRULE line into a rule, or null when the FREQ is missing/unknown. */
export function parseRrule(text: string): Rrule | null {
  const parts: Record<string, string> = {};
  for (const token of text.split(";")) {
    const eq = token.indexOf("=");
    if (eq < 0) continue;
    parts[token.slice(0, eq).trim().toUpperCase()] = token.slice(eq + 1).trim();
  }
  const freq = (parts.FREQ ?? "").toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;

  const interval = Math.max(1, Number.parseInt(parts.INTERVAL ?? "1", 10) || 1);
  const count = parts.COUNT ? Math.max(1, Number.parseInt(parts.COUNT, 10) || 1) : null;

  let until: Date | null = null;
  if (parts.UNTIL) {
    const m = UNTIL_RE.exec(parts.UNTIL.trim());
    if (m) {
      const [, y, mo, d, h, mi, s] = m;
      until = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), h ? Number(h) : 23, mi ? Number(mi) : 59, s ? Number(s) : 59));
    }
  }

  let byday: number[] | null = null;
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(",")
      .map((token) => token.trim().toUpperCase().replace(/^[+-]?\d+/, "")) // drop an ordinal prefix like 2MO
      .map((code) => WEEKDAYS[code])
      .filter((value): value is number => value !== undefined);
    byday = days.length > 0 ? [...new Set(days)] : null;
  }

  return { freq, interval, count, until, byday };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** A wall date's day-of-week (0=Sunday), by UTC calendar math on the components. */
function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Adds whole days to a {year,month,day}, by UTC calendar math. */
function addDays(year: number, month: number, day: number, n: number): { year: number; month: number; day: number } {
  const at = new Date(Date.UTC(year, month - 1, day) + n * 86_400_000);
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() };
}

export type ExpandResult = { starts: Date[]; supported: boolean; truncated: boolean };

/**
 * Expands a recurring event's start instants inside the window. `startWall` is
 * the event's DTSTART in wall-clock components; every occurrence keeps the same
 * time-of-day in `tz` (so it stays put across DST). Returns the instants within
 * the window (after EXDATE), whether the rule was understood, and whether the
 * cap clipped it.
 */
export function expandRecurrence(opts: {
  startWall: WallTime;
  tz: string;
  rule: Rrule;
  window: { start: Date; end: Date };
  exdateKeys: Set<string>;
  cap?: number;
}): ExpandResult {
  const { startWall, tz, rule, window, exdateKeys } = opts;
  const cap = Math.min(Math.max(1, opts.cap ?? MAX_OCCURRENCES), MAX_OCCURRENCES);
  const starts: Date[] = [];
  let generated = 0; // rule-generated occurrences (toward COUNT), before EXDATE.
  let truncated = false;

  const time = { hour: startWall.hour, minute: startWall.minute, second: startWall.second };
  const toInstant = (year: number, month: number, day: number): Date =>
    zonedWallTimeToUtc({ year, month, day, ...time }, tz);

  // Each period yields one or more candidate {year,month,day}.
  const emit = (year: number, month: number, day: number): "stop" | "ok" => {
    const at = toInstant(year, month, day);
    if (rule.until && at.getTime() > rule.until.getTime()) return "stop";
    generated += 1;
    if (!exdateKeys.has(dateKeyInZone(at, tz)) && at.getTime() >= window.start.getTime() && at.getTime() <= window.end.getTime()) {
      if (starts.length >= cap) {
        truncated = true;
        return "stop";
      }
      starts.push(at);
    }
    if (rule.count !== null && generated >= rule.count) return "stop";
    return "ok";
  };

  outer: for (let k = 0; k < MAX_PERIODS; k += 1) {
    let candidates: { year: number; month: number; day: number }[] = [];

    if (rule.freq === "DAILY") {
      candidates = [addDays(startWall.year, startWall.month, startWall.day, k * rule.interval)];
    } else if (rule.freq === "WEEKLY") {
      if (rule.byday && rule.byday.length > 0) {
        const dow = dayOfWeek(startWall.year, startWall.month, startWall.day);
        const weekStart = addDays(startWall.year, startWall.month, startWall.day, -dow + k * rule.interval * 7);
        candidates = rule.byday
          .slice()
          .sort((a, b) => a - b)
          .map((weekday) => addDays(weekStart.year, weekStart.month, weekStart.day, weekday))
          // The first week only counts days on or after DTSTART.
          .filter((date) => Date.UTC(date.year, date.month - 1, date.day) >= Date.UTC(startWall.year, startWall.month - 1, startWall.day));
      } else {
        candidates = [addDays(startWall.year, startWall.month, startWall.day, k * rule.interval * 7)];
      }
    } else if (rule.freq === "MONTHLY") {
      const base = startWall.year * 12 + (startWall.month - 1) + k * rule.interval;
      const year = Math.floor(base / 12);
      const month = (base % 12) + 1;
      if (startWall.day <= daysInMonth(year, month)) candidates = [{ year, month, day: startWall.day }];
    } else {
      const year = startWall.year + k * rule.interval;
      if (startWall.day <= daysInMonth(year, startWall.month)) candidates = [{ year, month: startWall.month, day: startWall.day }];
    }

    // Once a whole period starts past the window's end (and the rule has no
    // earlier UNTIL to honour), there is nothing more to collect.
    const periodStart = toInstant(
      candidates[0]?.year ?? startWall.year,
      candidates[0]?.month ?? startWall.month,
      candidates[0]?.day ?? startWall.day,
    );
    const pastWindow = periodStart.getTime() > window.end.getTime();

    for (const candidate of candidates) {
      const result = emit(candidate.year, candidate.month, candidate.day);
      if (result === "stop") break outer;
    }
    if (pastWindow) break;
  }

  starts.sort((a, b) => a.getTime() - b.getTime());
  return { starts, supported: true, truncated };
}
