/**
 * Temporal grounding (Wave 4 §7): a phrase the household said → an actual
 * date, in the household's own timezone.
 *
 * The model — or a rule — only ever names the phrase ("next Friday",
 * "tomorrow after school"). This module decides what day that is, so the
 * same words always land on the same date, testably, without a clock and
 * without asking a model to do calendar arithmetic it cannot be trusted
 * with. Anything it cannot pin down returns null, and the caller asks.
 *
 * Conventions, chosen once and written down so they are not re-decided per
 * feature:
 *
 *   - Weeks start on Monday.
 *   - "Friday" / "this Friday" / "on Friday" is the coming Friday — today,
 *     if today is Friday.
 *   - "Next Friday" is the Friday of next week (Monday-start), which is what
 *     most people mean when they bother to say "next". On a weekend the two
 *     coincide, and that is fine: they genuinely mean the same day then.
 *   - "This weekend" is the Saturday–Sunday of this week (from today if it
 *     is already the weekend); "next weekend" is the one after.
 *   - "This week" runs from today to Sunday; "next week" is next Monday to
 *     Sunday.
 *   - Parts of the day are windows, not guesses at an exact time:
 *     tonight 18:00–23:00, this evening 17:00–21:00, this morning
 *     06:00–12:00, this afternoon 12:00–17:00, after school 15:30–18:00,
 *     before dinner 17:00–19:00. A household's own routines can refine these
 *     later; until then they are stated, not hidden.
 */

import { isoDateIn } from "../context/format";

export type TemporalPrecision = "day" | "range" | "part_of_day";

export type TemporalResolution = {
  /** The phrase as understood, normalised ("tomorrow after school"). */
  phrase: string;
  precision: TemporalPrecision;
  /** The (first) local day, YYYY-MM-DD. */
  date: string;
  /** The last local day of a range, YYYY-MM-DD; equal to `date` otherwise. */
  endDate: string;
  /** A local time window within the day, "HH:MM", when the phrase names one. */
  window: { from: string; to: string } | null;
  /** Human words for a reply: "tomorrow (Thu 24 Sep)", "Fri 2 Oct". */
  label: string;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"] as const;

const PARTS_OF_DAY: Record<string, { from: string; to: string; words: string }> = {
  morning: { from: "06:00", to: "12:00", words: "morning" },
  afternoon: { from: "12:00", to: "17:00", words: "afternoon" },
  evening: { from: "17:00", to: "21:00", words: "evening" },
  night: { from: "18:00", to: "23:00", words: "night" },
  "after school": { from: "15:30", to: "18:00", words: "after school" },
  "before dinner": { from: "17:00", to: "19:00", words: "before dinner" },
};

/** The phrases this module understands, for a rule's regex to capture whole. */
export const TEMPORAL_PHRASE =
  "(?:(?:on |this |next |coming |by )?(?:today|tonight|tomorrow(?: morning| afternoon| evening| night| after school| before dinner)?|day after tomorrow|yesterday|(?:this |next )?(?:week|weekend)|" +
  "(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?(?: morning| afternoon| evening| night| after school| before dinner)?|" +
  "this (?:morning|afternoon|evening)|after school|before dinner))";

/**
 * Resolves `phrase` against `now` in `timezone`. Pure: the same arguments
 * always give the same answer.
 */
export function resolveTemporal(phrase: string, options: { timezone: string; now: Date }): TemporalResolution | null {
  const text = normalise(phrase);
  if (!text) return null;
  const today = isoDateIn(options.now, options.timezone);

  // "Later today", "in 2 hours", "on my way back from office": a moment
  // counted from now, not a day — the answers our own reminder question
  // offers must always be understood.
  const soon = soonFrom(text, options);
  if (soon) return soon;

  // A day, optionally followed by a part of it: "tomorrow after school",
  // "friday evening". Split the part off first so both halves resolve.
  const { dayText, part } = splitPartOfDay(text);

  const day = dayFrom(dayText, today);
  if (!day) return null;

  if (part) {
    const window = PARTS_OF_DAY[part]!;
    if (day.precision === "range") return null; // "next week after school" is not a moment.
    return {
      phrase: text,
      precision: "part_of_day",
      date: day.date,
      endDate: day.date,
      window: { from: window.from, to: window.to },
      label: `${day.label} ${window.words}`,
    };
  }

  return { phrase: text, precision: day.precision, date: day.date, endDate: day.endDate, window: day.window, label: day.label };
}

/**
 * One day, or null — the shape a write that needs a single date wants
 * (an absence, an appointment). A range ("next week") is not one day, so it
 * is null here and the caller asks which day.
 */
export function resolveDay(phrase: string, options: { timezone: string; now: Date }): string | null {
  const resolved = resolveTemporal(phrase, options);
  return resolved && resolved.precision !== "range" ? resolved.date : null;
}

/** Where the household's clock stands: its local day and minutes after midnight. */
export function localClock(now: Date, timezone: string): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { date: isoDateIn(now, timezone), minute: (hour % 24) * 60 + minute };
}

/** "Later today" when nothing more is said: about an hour from now, on the quarter hour, before the day is over. */
export function laterToday(now: Date): Date {
  return roundUpToQuarter(new Date(now.getTime() + 60 * 60_000));
}

export function roundUpToQuarter(at: Date): Date {
  const quarter = 15 * 60_000;
  return new Date(Math.ceil(at.getTime() / quarter) * quarter);
}

const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, "a couple of": 2, "a few": 3 };

/** Words for the trip home, which every household means as "this evening". */
export const COMMUTE_PATTERN =
  /\b(?:way\s+(?:back|home)|back\s+(?:home|from\s+(?:the\s+)?(?:office|work|school))|(?:coming|going|heading|driving|walking|getting)\s+(?:back\s+)?home|(?:leave|leaving)\s+(?:the\s+)?(?:office|work)|after\s+(?:work|office))\b/;

/**
 * A moment rather than a day: "later today", "in 2 hours", "in half an
 * hour", "on the way home". Returned as a day with a one-minute window, so
 * every caller that only wants the day still gets the right one.
 */
function soonFrom(text: string, options: { timezone: string; now: Date }): TemporalResolution | null {
  const relative = /^(an?|one|two|three|four|five|\d{1,3}|a couple of|a few|half an?) (minutes?|mins?|hours?|hrs?)(?: from now)?$/.exec(text);
  if (relative) {
    const unit = /^h/.test(relative[2]!) ? 60 : 1;
    const count = relative[1]!.startsWith("half") ? 0.5 : (COUNT_WORDS[relative[1]!] ?? Number(relative[1]));
    if (!Number.isFinite(count) || count <= 0 || count * unit > 24 * 60) return null;
    return momentOf(new Date(options.now.getTime() + count * unit * 60_000), text, options);
  }
  const laterPart = /^later (?:tonight|this (evening|afternoon))$/.exec(text);
  if (laterPart) {
    // "Later this evening" at noon is this evening, not one o'clock.
    const part = laterPart[1] ?? "night";
    const clock = localClock(options.now, options.timezone);
    const window = PARTS_OF_DAY[part]!;
    if (clock.minute < minutesOf(window.from)) {
      return { phrase: text, precision: "part_of_day", date: clock.date, endDate: clock.date, window: { from: window.from, to: window.to }, label: `this ${window.words} (${short(clock.date)})`.replace("this night", "tonight") };
    }
    return momentOf(laterToday(options.now), text, options);
  }
  if (/^(?:later|later on|later today|sometime later|sometime today|a bit later|soon)$/.test(text)) {
    return momentOf(laterToday(options.now), text, options);
  }
  if (COMMUTE_PATTERN.test(text)) {
    const clock = localClock(options.now, options.timezone);
    const evening = PARTS_OF_DAY.evening!;
    // Still ahead, or under way: this evening's window. Past it: soon.
    if (clock.minute < minutesOf(evening.to)) {
      return { phrase: text, precision: "part_of_day", date: clock.date, endDate: clock.date, window: { from: evening.from, to: evening.to }, label: `this evening (${short(clock.date)})` };
    }
    return momentOf(roundUpToQuarter(new Date(options.now.getTime() + 15 * 60_000)), text, options);
  }
  return null;
}

/** "today (Thu 24 Sep)", "tomorrow (Fri 25 Sep)", or just "Sat 26 Sep". */
export function dayLabel(date: string, today: string): string {
  return date === today ? `today (${short(date)})` : date === addDays(today, 1) ? `tomorrow (${short(date)})` : short(date);
}

function momentOf(at: Date, text: string, options: { timezone: string; now: Date }): TemporalResolution {
  const clock = localClock(at, options.timezone);
  const today = isoDateIn(options.now, options.timezone);
  const time = `${String(Math.floor(clock.minute / 60)).padStart(2, "0")}:${String(clock.minute % 60).padStart(2, "0")}`;
  return { phrase: text, precision: "part_of_day", date: clock.date, endDate: clock.date, window: { from: time, to: time }, label: dayLabel(clock.date, today) };
}

function minutesOf(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/**
 * A trailing "when" a rule's pattern does not capture — "while I'm on my way
 * back from office", "after work", "later today", "in 2 hours" — split off
 * the thing to be reminded of, so the reminder says "pick up coriander", not
 * "pick up coriander while my way back from office".
 */
export function splitTrailingWhen(what: string): { what: string; when: string } | null {
  const trimmed = what.trim();
  const commute = /\s+(?:while|when|on|as|during)\s+(?:[a-z']+\s+){0,4}?(?:way\s+(?:back|home)|back\s+(?:home|from)|(?:coming|going|heading|driving|walking|getting)\s+(?:back\s+)?home|(?:leave|leaving)\s+(?:the\s+)?(?:office|work))\b.*$/i.exec(trimmed)
    ?? /\s+after\s+(?:work|office)\b.*$/i.exec(trimmed);
  if (commute && commute.index > 0) return { what: trimmed.slice(0, commute.index).trim(), when: "on the way home" };
  const soon = /\s+(later(?: today| on| tonight)?|in (?:an?|one|two|three|\d{1,3}|half an?|a couple of|a few) (?:minutes?|mins?|hours?|hrs?))$/i.exec(trimmed);
  if (soon && soon.index > 0) return { what: trimmed.slice(0, soon.index).trim(), when: soon[1]!.toLowerCase() };
  return null;
}

type Day = { precision: TemporalPrecision; date: string; endDate: string; window: { from: string; to: string } | null; label: string };

function dayFrom(text: string, today: string): Day | null {
  // No day named ("after school" alone, "tonight"): today.
  if (text === "" || text === "today" || text === "now") return single(today, `today (${short(today)})`);
  if (text === "tonight") return { ...single(today, `tonight (${short(today)})`), precision: "part_of_day", window: { ...pick("night") } };
  if (/^this (morning|afternoon|evening)$/.test(text)) {
    const part = text.replace("this ", "");
    return { ...single(today, `this ${part} (${short(today)})`), precision: "part_of_day", window: pick(part) };
  }
  if (text === "tomorrow" || text === "tmrw" || text === "tmr") return single(addDays(today, 1), `tomorrow (${short(addDays(today, 1))})`);
  if (text === "day after tomorrow" || text === "the day after tomorrow") return single(addDays(today, 2), short(addDays(today, 2)));
  if (text === "yesterday") return single(addDays(today, -1), `yesterday (${short(addDays(today, -1))})`);

  const weekdayOfToday = weekdayOf(today);
  const mondayThisWeek = addDays(today, -((weekdayOfToday + 6) % 7));

  if (text === "this week") return range(today, addDays(mondayThisWeek, 6), "this week");
  if (text === "next week") return range(addDays(mondayThisWeek, 7), addDays(mondayThisWeek, 13), "next week");
  if (text === "this weekend" || text === "weekend" || text === "the weekend") {
    const saturday = addDays(mondayThisWeek, 5);
    const start = today > saturday ? today : saturday;
    return range(start, addDays(mondayThisWeek, 6), "this weekend");
  }
  if (text === "next weekend") return range(addDays(mondayThisWeek, 12), addDays(mondayThisWeek, 13), "next weekend");

  // "friday", "this friday", "on fri", "coming friday", "next friday".
  const weekday = /^(?:(this|next|coming) )?([a-z]+)$/.exec(text);
  if (weekday) {
    const index = weekdayIndex(weekday[2]!);
    if (index !== null) {
      if (weekday[1] === "next") {
        const offsetFromMonday = (index + 6) % 7;
        const date = addDays(mondayThisWeek, 7 + offsetFromMonday);
        return single(date, short(date));
      }
      const ahead = (index - weekdayOfToday + 7) % 7;
      const date = addDays(today, ahead);
      return single(date, ahead === 0 ? `today (${short(date)})` : ahead === 1 ? `tomorrow (${short(date)})` : short(date));
    }
  }

  // An explicit date: "2026-10-02", "2 oct", "october 2", "2nd october".
  const explicit = explicitDate(text, today);
  if (explicit) return single(explicit, short(explicit));

  return null;
}

function explicitDate(text: string, today: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return validIso(text);

  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+)(?: (\d{4}))?$/.exec(text);
  const monthFirst = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(text);
  const parts = dayFirst
    ? { day: Number(dayFirst[1]), month: monthIndex(dayFirst[2]!), year: dayFirst[3] ? Number(dayFirst[3]) : null }
    : monthFirst
      ? { day: Number(monthFirst[2]), month: monthIndex(monthFirst[1]!), year: monthFirst[3] ? Number(monthFirst[3]) : null }
      : null;
  if (!parts || parts.month === null) return null;

  const thisYear = Number(today.slice(0, 4));
  const candidate = validIso(isoOf(parts.year ?? thisYear, parts.month, parts.day));
  if (!candidate) return null;
  // No year said and the date has passed: the household means the next one.
  if (!parts.year && candidate < today) return validIso(isoOf(thisYear + 1, parts.month, parts.day));
  return candidate;
}

function splitPartOfDay(text: string): { dayText: string; part: string | null } {
  for (const part of ["after school", "before dinner", "morning", "afternoon", "evening", "night"]) {
    if (text === part) return { dayText: "", part };
    if (text.endsWith(` ${part}`) && !/^this (morning|afternoon|evening)$/.test(text)) {
      return { dayText: text.slice(0, -part.length - 1).trim(), part };
    }
  }
  return { dayText: text, part: null };
}

function normalise(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[.,!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:on|by|for|at|from|in) /, "")
    .replace(/^the coming /, "coming ")
    .replace(/'s$/, "");
}

function weekdayIndex(word: string): number | null {
  if (word.length < 3) return null;
  const index = WEEKDAYS.findIndex((day) => day === word || (word.length >= 3 && day.startsWith(word)) || day.startsWith(word.replace(/s$/, "")));
  return index >= 0 ? index : null;
}

function monthIndex(word: string): number | null {
  if (word.length < 3) return null;
  const index = MONTHS.findIndex((month) => month === word || month.startsWith(word));
  return index >= 0 ? index : null;
}

function pick(part: string): { from: string; to: string } {
  const window = PARTS_OF_DAY[part]!;
  return { from: window.from, to: window.to };
}

function single(date: string, label: string): Day {
  return { precision: "day", date, endDate: date, window: null, label };
}

function range(from: string, to: string, words: string): Day {
  return { precision: "range", date: from, endDate: to, window: null, label: `${words} (${short(from)} – ${short(to)})` };
}

function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoOf(year: number, monthIndex0: number, day: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function validIso(value: string): string | null {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

/** "Fri 2 Oct" — the date itself, never relative, so a reply is checkable. */
function short(isoDate: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(new Date(`${isoDate}T12:00:00Z`));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}
