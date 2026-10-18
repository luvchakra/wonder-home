import type { CalendarSpan } from "../conversation/temporal";
import { localMoment, shiftDate } from "./dates";
import type { CalendarEntry, CalendarSource } from "./projection";

/**
 * HomeTalk's answer to a calendar question over a month-sized span ("do you
 * see any events in December?"), written by rules from the calendar itself,
 * never by a model (HomeEvents, the read half of design §5 case B).
 *
 * The entries are what `calendarRange` returned for this person, so a private
 * event of someone else's never reaches the words. Everything said is a
 * date and a title from the record. A source that could not be read is said,
 * so an incomplete month never sounds like a free one.
 */

export const MAX_LISTED = 12;

/**
 * Words that put a question in another part of the home. "Which bills are due
 * this month?" names a month, but it asks about bills — HomeBrain's to answer
 * from the bills — and a list of the month's events would answer something
 * nobody asked.
 */
const ANOTHER_PART = /\b(?:bills?|pay|paid|payments?|fees?|rent|emi|insurance|owe|homework|worksheets?|projects?|exams?|tests?|groceries|grocery|shopping|stock|meals?|dinner|lunch|breakfast|cook|cooking|medicines?|doctor|dentist|appointments?|check-?ups?|services?|repairs?)\b/i;

/** Whether a month-sized question is about the calendar itself, rather than one part of the home over that month. */
export function asksTheCalendar(utterance: string): boolean {
  return !ANOTHER_PART.test(utterance);
}

export function calendarSpanReply(input: {
  span: CalendarSpan;
  entries: readonly CalendarEntry[];
  failedSources: readonly CalendarSource[];
  timeZone: string;
}): string {
  const { span, entries, timeZone } = input;
  const incomplete = input.failedSources.length > 0 ? "Part of the calendar could not be read just now, so this may not be everything." : null;
  if (entries.length === 0) {
    return [`Nothing is on the calendar for ${span.label}.`, incomplete].filter(Boolean).join(" ");
  }
  // By day first; within a day, all-day before timed, then by time.
  const byDay = [...entries].sort((a, b) => {
    const day = localMoment(a.start, timeZone).dateKey.localeCompare(localMoment(b.start, timeZone).dateKey);
    if (day !== 0) return day;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start.getTime() - b.start.getTime();
  });
  const lines = byDay.slice(0, MAX_LISTED).map((entry) => `- ${when(entry, timeZone)} — ${entry.title}${note(entry)}`);
  const rest = entries.length - MAX_LISTED;
  return [
    `Here's what's on the calendar for ${span.label}:`,
    lines.join("\n"),
    [rest > 0 ? `…and ${rest} more. The Calendar has them all.` : null, incomplete].filter(Boolean).join(" ") || null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const DATE = (timeZone: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone });
const TIME = (timeZone: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone });

/** "Tue 8 Dec" for an all-day entry, "Tue 8 Dec, 6:30 pm" for a timed one. */
function when(entry: CalendarEntry, timeZone: string): string {
  // en-GB writes September "Sept"; every other date WonderHome says is "Sep".
  const day = DATE(timeZone).format(entry.start).replace(",", "").replace(/\bSept\b/, "Sep");
  if (entry.allDay || entry.kind !== "block") return day;
  return `${day}, ${TIME(timeZone).format(entry.start).replace(" AM", " am").replace(" PM", " pm")}`;
}

function note(entry: CalendarEntry): string {
  if (entry.source === "holiday") return " (public holiday)";
  if (entry.status === "proposed") return " (proposed)";
  return "";
}

// --- Looking ahead: "what's the next event?", "when is the next public holiday?" ---

/** How far "next" looks: a year, so the next holiday or birthday is always found. */
export const LOOK_AHEAD_DAYS = 365;

export type LookAhead = {
  /** Only this kind of entry, or anything on the calendar. */
  only: "holiday" | "birthday" | null;
};

const HOLIDAY = /\b(?:public |bank |national |government )?holidays?\b/i;
const BIRTHDAY = /\bbirthdays?\b/i;
const AHEAD = /\b(?:next|upcoming|coming(?: up)?|soon|nearest|after this)\b/i;
const ON_THE_CALENDAR = /\b(?:events?|plans?|happening|scheduled|calendar|on)\b/i;

/**
 * Whether a question asks what comes next on the calendar, read by rules.
 * "What's the next upcoming event?", "how about the public holiday?" (a
 * holiday question needs no "next": the calendar's holidays are the answer),
 * "any birthdays coming up?". A question naming a day or a span is not this
 * — the caller asks `resolveCalendarSpan` first — and neither is one about
 * another part of the home.
 */
export function readLookAhead(utterance: string): LookAhead | null {
  if (!asksTheCalendar(utterance)) return null;
  if (HOLIDAY.test(utterance)) return { only: "holiday" };
  if (!AHEAD.test(utterance)) return null;
  if (BIRTHDAY.test(utterance)) return { only: "birthday" };
  if (ON_THE_CALENDAR.test(utterance)) return { only: null };
  return null;
}

/** The entries that still lie ahead at `now`, of the kind asked, soonest first. */
export function aheadOf(entries: readonly CalendarEntry[], lookAhead: LookAhead, now: Date, timeZone: string): CalendarEntry[] {
  const today = localMoment(now, timeZone).dateKey;
  return entries
    .filter((entry) => (lookAhead.only === "holiday" ? entry.source === "holiday" : lookAhead.only === "birthday" ? entry.source === "occasion" : true))
    .filter((entry) => (entry.allDay || entry.kind !== "block" ? localMoment(entry.start, timeZone).dateKey >= today : (entry.end ?? entry.start).getTime() > now.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * The next thing on the calendar, and the two after it — from the calendar
 * itself, for this person, by rules. Never "your week is clear" when the
 * next event is in three weeks.
 */
export function lookAheadReply(input: { lookAhead: LookAhead; entries: readonly CalendarEntry[]; failedSources: readonly CalendarSource[]; now: Date; timeZone: string }): string {
  const { lookAhead, timeZone } = input;
  const ahead = aheadOf(input.entries, lookAhead, input.now, timeZone);
  const what = lookAhead.only === "holiday" ? "public holiday" : lookAhead.only === "birthday" ? "birthday" : "thing on the calendar";
  const incomplete = input.failedSources.length > 0 ? "Part of the calendar could not be read just now, so this may not be everything." : null;
  if (ahead.length === 0) {
    const none =
      lookAhead.only === "holiday"
        ? "No public holidays are on your calendar for the next 12 months. You can choose a holiday list in the Calendar's settings."
        : lookAhead.only === "birthday"
          ? "No birthdays are on the calendar for the next 12 months. A birthday appears once a date of birth is added in Family."
          : "Nothing is on the calendar for the next 12 months.";
    return [none, incomplete].filter(Boolean).join(" ");
  }
  const [next, ...rest] = ahead;
  // Asked for holidays, "(public holiday)" after each one says nothing new.
  const said = (entry: CalendarEntry) => (lookAhead.only === "holiday" ? "" : note(entry));
  const lines = [`The next ${what} is **${next!.title}**${said(next!)}, ${when(next!, timeZone)}.`];
  const after = rest.slice(0, 2);
  if (after.length > 0) lines.push(`After that:\n${after.map((entry) => `- ${when(entry, timeZone)} — ${entry.title}${said(entry)}`).join("\n")}`);
  if (incomplete) lines.push(incomplete);
  return lines.join("\n\n");
}

/** The days "next" looks across: from today, a year ahead, in the household's zone. */
export function lookAheadSpan(now: Date, timeZone: string): CalendarSpan {
  const today = localMoment(now, timeZone).dateKey;
  return { from: today, to: shiftDate(today, LOOK_AHEAD_DAYS), label: "the next 12 months" };
}
