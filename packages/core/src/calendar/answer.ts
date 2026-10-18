import type { CalendarSpan } from "../conversation/temporal";
import { localMoment } from "./dates";
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
