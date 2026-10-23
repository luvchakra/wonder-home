import { resolveTemporal, TEMPORAL_PHRASE, type CalendarSpan } from "../conversation/temporal";
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
 * Who is coming to one event — its guests, their replies — is that event's
 * detail, HomeBrain's to answer from the event itself. "A few people are
 * coming" is not "coming up" (the owner's report, 2026-10-18: Asmi's party
 * with guests was answered with the family's dates of birth).
 */
const ATTENDANCE = /\b(?:who(?:'s|\s+is|\s+are|\s+all)?\s+(?:coming|invited|attending|joining)|guests?|invit(?:e|es|ed|ation|ations)|rsvps?|replied|attending|(?:people|friends|kids|families|they|few)\s+(?:are\s+|is\s+)?(?:coming|joining))\b/i;

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
  if (ATTENDANCE.test(utterance)) return null;
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

// --- A day or a week: "what's happening tomorrow?", "anything on this weekend?" ---

/** The longest span answered day by day; past it, a month answer or HomeBrain says it. */
export const SCHEDULE_MAX_DAYS = 14;

/**
 * Words that ask what is on, as opposed to one fact about a day ("is Asmi free
 * tomorrow?" is HomeBrain's). Kept narrow so a question about something else
 * that happens to name a day never becomes a list of the day. "What does Asmi
 * have tomorrow?" stays HomeBrain's too: it means her to-dos and the school's
 * notices as well, which are not on the calendar.
 */
const ASKS_WHAT_IS_ON =
  /\b(?:what(?:'s|\s+is|\s+are|\s+all)?\s+(?:happening|on|planned|scheduled|going\s+on|lined\s+up|up)|what(?:'s|\s+is|\s+are)\s+(?:we|they|\w+)\s+(?:doing|up\s+to)|(?:anything|something)\s+(?:on|planned|happening|scheduled)|any\s+(?:events?|plans?)|(?:my|our|the|family'?s?)\s+(?:schedule|agenda|calendar|day|plans?)|events?|schedule|agenda|calendar|plans?\s+for)\b/i;

/** Whether a question asks what is on a day or a week, read by rules. */
export function asksWhatIsOn(utterance: string): boolean {
  return asksTheCalendar(utterance) && !ATTENDANCE.test(utterance) && ASKS_WHAT_IS_ON.test(utterance);
}

export type ScheduleSpan = {
  from: string;
  to: string;
  /** "tomorrow (Sat 24 Oct)", "this weekend (Sat 24 Oct – Sun 25 Oct)". */
  label: string;
  /** A part of the day asked about ("tomorrow evening"), as local "HH:MM". */
  window: { from: string; to: string } | null;
};

/**
 * Who each entry is for, by first name, when the calendar names someone:
 * "Grade 5 PT1 Parent Teacher Meeting (Asmi)".
 */
export type ScheduleNames = ReadonlyMap<string, string>;

/**
 * What is on each day of a short span, from the calendar itself — the same
 * entries the Calendar screen shows this person, every module included — by
 * rules (the owner's report, 2026-10-23: a child's classes on the Calendar
 * were missing from "what is happening tomorrow").
 */
export function scheduleReply(input: {
  span: ScheduleSpan;
  entries: readonly CalendarEntry[];
  failedSources: readonly CalendarSource[];
  timeZone: string;
  names: ScheduleNames;
  /** Only this person's entries, when the question named them. */
  forMemberId?: string | null;
}): string {
  const { span, timeZone, names } = input;
  const forName = input.forMemberId ? (names.get(input.forMemberId) ?? null) : null;
  const incomplete = input.failedSources.length > 0 ? "Part of the calendar could not be read just now, so this may not be everything." : null;
  const entries = input.entries
    .filter((entry) => !input.forMemberId || entry.memberIds.includes(input.forMemberId) || entry.source === "holiday")
    .filter((entry) => inWindow(entry, span.window, timeZone));
  const oneDay = span.from === span.to;
  const who = forName ? ` for ${forName}` : "";
  if (entries.length === 0) {
    return [`Nothing is on the calendar${who} ${span.label}.`, incomplete].filter(Boolean).join(" ");
  }
  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of [...entries].sort(inDayOrder(timeZone))) {
    const day = entry.occurrenceDate ?? localMoment(entry.start, timeZone).dateKey;
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }
  const line = (entry: CalendarEntry) => {
    const people = forName ? [] : entry.memberIds.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
    const where = entry.detail && entry.source !== "holiday" ? ` · ${entry.detail}` : "";
    return `- ${clockOf(entry, timeZone)} — **${entry.title}**${people.length > 0 ? ` (${people.join(", ")})` : ""}${note(entry)}${where}`;
  };
  const sections = oneDay
    ? [[...byDay.values()].flat().map(line).join("\n")]
    : [...byDay.entries()].map(([day, list]) => `**${DATE(timeZone).format(new Date(`${day}T12:00:00Z`)).replace(",", "").replace(/\bSept\b/, "Sep")}**\n${list.map(line).join("\n")}`);
  const heading = `Here's what's on the calendar${who} ${span.label}:`;
  return [heading, ...sections, incomplete].filter(Boolean).join("\n\n");
}

/** All-day first, then by time. */
function inDayOrder(timeZone: string) {
  return (a: CalendarEntry, b: CalendarEntry) => {
    const day = (a.occurrenceDate ?? localMoment(a.start, timeZone).dateKey).localeCompare(b.occurrenceDate ?? localMoment(b.start, timeZone).dateKey);
    if (day !== 0) return day;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start.getTime() - b.start.getTime();
  };
}

/** "8:30 am – 9:30 am", "6:00 pm", "All day", "Due". */
function clockOf(entry: CalendarEntry, timeZone: string): string {
  if (entry.allDay) return "All day";
  const time = (at: Date) => TIME(timeZone).format(at).replace(" AM", " am").replace(" PM", " pm");
  if (entry.kind !== "block") return time(entry.start);
  return entry.end && entry.end.getTime() > entry.start.getTime() ? `${time(entry.start)} – ${time(entry.end)}` : time(entry.start);
}

/** Whether an entry falls in the part of the day asked about; all-day entries always do. */
function inWindow(entry: CalendarEntry, window: ScheduleSpan["window"], timeZone: string): boolean {
  if (!window || entry.allDay) return true;
  const start = localMoment(entry.start, timeZone).minuteOfDay;
  const end = entry.end ? localMoment(entry.end, timeZone).minuteOfDay : start;
  const [from, to] = [window.from, window.to].map((hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))) as [number, number];
  return start < to && Math.max(end, start) >= from;
}

/**
 * The day or days a question names, up to a fortnight: the "when" the
 * understanding found, else a day phrase in the words themselves. Deterministic
 * code decides the days, in the household's zone (HomeTalk 2.0).
 */
export function scheduleSpanOf(when: unknown, utterance: string, options: { timezone: string; now: Date }): ScheduleSpan | null {
  const phrases = [typeof when === "string" ? when : null, new RegExp(`\\b${TEMPORAL_PHRASE}\\b`, "i").exec(utterance)?.[0] ?? null].filter((phrase): phrase is string => Boolean(phrase?.trim()));
  for (const phrase of phrases) {
    const resolved = resolveTemporal(phrase, options);
    if (!resolved) continue;
    if (Date.parse(`${resolved.endDate}T00:00:00Z`) - Date.parse(`${resolved.date}T00:00:00Z`) >= SCHEDULE_MAX_DAYS * 86_400_000) return null;
    const label = /^(?:today|tonight|tomorrow|this|next|coming)\b/i.test(resolved.label) ? resolved.label : `on ${resolved.label}`;
    return { from: resolved.date, to: resolved.endDate, label, window: resolved.precision === "part_of_day" ? resolved.window : null };
  }
  return null;
}

/** The one person a question names by first name ("what is Asmi doing tomorrow?"), or null for none or several. */
export function memberNamedIn(utterance: string, people: readonly { id: string; firstName: string }[]): string | null {
  const named = people.filter((person) => person.firstName.trim() && new RegExp(`\\b${person.firstName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(utterance));
  return named.length === 1 ? named[0]!.id : null;
}
