import type { HouseholdContextItem, PrivacyClass } from "../context/types";

/**
 * Inferences with evidence (HomeBrain 4.0 §3.5, story 14-029).
 *
 * What a family would notice by putting two records side by side — "movie
 * night is the evening before Asmi's maths exam", "the electricity bill is due
 * on a day Kunal is away" — worked out by rules, never by a model. Each one
 * names the records it rests on, so it travels to a model with its evidence
 * and the validator can hold any "because" or "which means" in an answer to
 * an inference that actually says it (`unsupported_inference`).
 *
 * Pure: the items are already the viewer's own (`filterForViewer`), so an
 * inference can never join something this person may see to something they
 * may not. A rule states its arithmetic and fires on records, never on
 * likelihood.
 *
 * Built as designed except two rules that need records WonderHome does not
 * keep yet, and say so rather than guess: `guest_food` (a guest's food
 * preference — guests are outside the household and only their reply is
 * kept) and `school_kit` (what a school item needs bought is free text).
 * `clash` and `away_but_assigned` between events stay in
 * `context/conflicts.ts`, which already phrases them without private detail;
 * the meal-cook case of `away_but_assigned` is here.
 */

export type InsightRule = "night_before" | "meal_short" | "away_but_assigned" | "bill_before_trip" | "routine_gap" | "count" | "free_window";

export type Insight = {
  rule: InsightRule;
  statement: string;
  /** The context items it rests on — every one is sent with it. */
  evidence: string[];
  subjectMemberIds: string[];
  /** The day it is about, when there is one. */
  date: string | null;
  privacyClass: PrivacyClass;
};

/** A meal this many days ahead (today included) is close enough to be short of something. */
const MEAL_HORIZON_DAYS = 3;
/** An event starting at or after this local hour is an evening one. */
const EVENING_HOUR = 17;

const PRIVACY_ORDER: readonly PrivacyClass[] = ["general", "child", "financial", "location", "health", "private"];

export function householdInsights(items: readonly HouseholdContextItem[], options: { timezone: string; today: string; question?: string }): Insight[] {
  const usable = items.filter((item) => item.freshness !== "historical" && item.freshness !== "superseded");
  const names = new Map(usable.filter((item) => item.entityType === "member").map((item) => [item.entityId, firstName(String(item.attributes.displayName ?? ""))]));
  const name = (id: string | null | undefined) => (id ? names.get(id) ?? null : null);
  const away = new Map<string, HouseholdContextItem[]>();
  for (const absence of usable.filter((item) => item.entityType === "absence")) {
    const member = String(absence.attributes.memberId ?? "");
    away.set(member, [...(away.get(member) ?? []), absence]);
  }
  const awayOn = (member: string | null | undefined, date: string | null) => (member && date ? (away.get(member) ?? []).find((absence) => absence.attributes.date === date) ?? null : null);
  const insights: Insight[] = [];
  const add = (rule: InsightRule, statement: string, evidence: HouseholdContextItem[], date: string | null) =>
    insights.push({
      rule,
      statement,
      evidence: evidence.map((item) => item.id),
      subjectMemberIds: [...new Set(evidence.flatMap((item) => item.subjectMemberIds).filter(Boolean))],
      date,
      privacyClass: strictest(evidence.map((item) => item.privacyClass)),
    });

  // night_before: an evening event on day D, and a child's exam on D+1.
  // A school item marked exam, or a paper of an exam on Kids & School (08-015).
  const exams = usable.filter((item) => (item.entityType === "school_item" || item.entityType === "exam_paper") && item.attributes.kind === "exam" && typeof item.attributes.date === "string");
  for (const event of usable.filter((item) => item.entityType === "event" && typeof item.attributes.startsAt === "string")) {
    const date = String(event.attributes.date ?? "");
    if (localHour(new Date(String(event.attributes.startsAt)), options.timezone) < EVENING_HOUR) continue;
    for (const exam of exams) {
      if (exam.attributes.date !== addDays(date, 1)) continue;
      const child = String(exam.attributes.childMemberId ?? "");
      // Only an evening the child is part of — or one for nobody in particular.
      if (event.subjectMemberIds.length > 0 && !event.subjectMemberIds.includes(child)) continue;
      const subject = exam.attributes.subject ? `${exam.attributes.subject} ` : "";
      // A paper of an exam on Kids & School (08-015) says which exam it belongs to; a school item names itself.
      const which = exam.entityType === "exam_paper" ? `${subject}paper of the ${exam.attributes.examType}` : `${subject}exam (${exam.attributes.title})`;
      add("night_before", `${event.attributes.title} on ${weekday(date)} evening is the night before ${name(child) ?? "a child"}'s ${which} on ${weekday(String(exam.attributes.date))}.`, [event, exam], date);
    }
  }

  for (const meal of usable.filter((item) => item.entityType === "meal" && typeof item.attributes.date === "string")) {
    const date = String(meal.attributes.date);
    const ahead = daysBetween(options.today, date);
    // meal_short: a meal in the next few days that is short of things at home.
    const missing = Array.isArray(meal.attributes.missing) ? (meal.attributes.missing as unknown[]).map(String) : [];
    if (ahead >= 0 && ahead < MEAL_HORIZON_DAYS && missing.length > 0) {
      add("meal_short", `${weekday(date)}'s ${String(meal.attributes.slot ?? "meal")}, ${meal.attributes.title}, needs ${count(missing.length, "thing")} not at home: ${missing.join(", ")}.`, [meal], date);
    }
    // away_but_assigned: the cook is away the day they cook.
    const cook = typeof meal.attributes.cookMemberId === "string" ? meal.attributes.cookMemberId : null;
    const absence = awayOn(cook, date);
    if (absence && ahead >= 0) add("away_but_assigned", `${name(cook) ?? "The cook"} is away on ${weekday(date)}, the day they cook ${String(meal.attributes.slot ?? "the meal")} (${meal.attributes.title}).`, [meal, absence], date);
  }

  // bill_before_trip: a bill due on a day its payer is away.
  for (const bill of usable.filter((item) => item.entityType === "bill" && typeof item.attributes.date === "string" && item.attributes.status !== "paid")) {
    const date = String(bill.attributes.date);
    const payer = bill.subjectMemberIds.find(Boolean) ?? null;
    const absence = awayOn(payer, date);
    if (absence && daysBetween(options.today, date) >= 0) add("bill_before_trip", `The ${bill.attributes.title} bill is due on ${weekday(date)} ${dayOfMonth(date)}, a day ${name(payer) ?? "the person who pays it"} is away.`, [bill, absence], date);
  }

  // routine_gap: the one person who looks after something is away, and nobody backs them up.
  for (const duty of usable.filter((item) => item.entityType === "responsibility")) {
    const people = duty.subjectMemberIds.filter(Boolean);
    if (people.length !== 1) continue;
    for (const absence of (away.get(people[0]!) ?? []).filter((entry) => daysBetween(options.today, String(entry.attributes.date)) >= 0 && daysBetween(options.today, String(entry.attributes.date)) < 7)) {
      const date = String(absence.attributes.date);
      add("routine_gap", `${name(people[0]) ?? "Its owner"} is away on ${weekday(date)} and nobody backs them up for ${String(duty.attributes.title ?? "it").toLowerCase()}.`, [duty, absence], date);
    }
  }

  // count: "how many are coming?" is arithmetic over the replies (rule 9).
  if (options.question && /\bhow (?:many|much)\b|\bnumber of\b|\bheadcount\b/i.test(options.question)) {
    for (const event of usable.filter((item) => item.entityType === "event" && Array.isArray(item.attributes.guests))) {
      const guests = item_guests(event);
      const yes = guests.filter((guest) => guest.response === "yes");
      const coming = yes.reduce((sum, guest) => sum + guest.partySize, 0);
      const breakdown = yes.map((guest) => `${guest.name} ${guest.partySize}`).join(" + ");
      const waiting = guests.filter((guest) => guest.response !== "yes" && guest.response !== "no").length;
      add(
        "count",
        `${count(coming, "guest")} ${coming === 1 ? "is" : "are"} coming to ${event.attributes.title}${yes.length > 0 ? ` (${breakdown})` : ""}, from ${count(guests.length, "reply", "replies")}${waiting > 0 ? `; ${waiting} not decided yet` : ""}.`,
        [event],
        String(event.attributes.date ?? "") || null,
      );
    }
  }

  // free_window: "what's the best time for a 2-day getaway?" is arithmetic
  // over the calendar — the coming weekends with nothing on for the family,
  // and what is on the others (rule 9). Never a model's guess at a date.
  const trip = options.question ? tripQuestion(options.question) : null;
  if (trip) {
    const busy = usable.filter(
      (item) =>
        (item.entityType === "event" && item.attributes.status !== "cancelled") ||
        item.entityType === "exam_paper" ||
        (item.entityType === "school_item" && (item.attributes.kind === "exam" || item.attributes.kind === "event")) ||
        item.entityType === "absence",
    );
    const daysOf = (item: HouseholdContextItem): string[] => {
      const from = typeof item.attributes.date === "string" ? item.attributes.date.slice(0, 10) : null;
      if (!from) return [];
      // The end is exclusive: an all-day Friday ends at Saturday midnight, and is not on Saturday.
      const until = item.entityType === "event" && typeof item.attributes.endsAt === "string" ? localDay(new Date(Date.parse(item.attributes.endsAt) - 1), options.timezone) : from;
      const span = Math.max(0, Math.min(14, daysBetween(from, until)));
      return Array.from({ length: span + 1 }, (_, index) => addDays(from, index));
    };
    const on = new Map<string, HouseholdContextItem[]>();
    for (const item of busy) for (const day of daysOf(item)) on.set(day, [...(on.get(day) ?? []), item]);
    const what = (item: HouseholdContextItem): string => {
      if (item.entityType === "absence") return `${name(String(item.attributes.memberId ?? "")) ?? "Someone"} is away`;
      if (item.entityType === "exam_paper") return `${name(String(item.attributes.childMemberId ?? "")) ?? "A child"}'s ${item.attributes.subject} paper of the ${item.attributes.examType}`;
      if (item.entityType === "school_item") return `${name(String(item.attributes.childMemberId ?? "")) ?? "A child"}'s ${item.attributes.title}`;
      return String(item.attributes.title ?? "an event");
    };
    // The window starts on a Saturday (a Friday for three days or more).
    const startDay = trip.days >= 3 ? 5 : 6;
    let first = addDays(options.today, 1);
    while (new Date(`${first}T00:00:00Z`).getUTCDay() !== startDay) first = addDays(first, 1);
    const clear: string[] = [];
    const blocked: { label: string; reasons: string[]; evidence: HouseholdContextItem[]; date: string }[] = [];
    for (let week = 0; week < TRIP_WEEKS; week += 1) {
      const start = addDays(first, week * 7);
      const days = Array.from({ length: Math.max(1, trip.days) }, (_, index) => addDays(start, index));
      const end = days[days.length - 1]!;
      const label = days.length === 1 ? shortDay(start) : `${shortDay(start)} to ${shortDay(end)}`;
      const during = [...new Set(days.flatMap((day) => on.get(day) ?? []))];
      // An exam the morning after is no time to be driving home from the hills.
      const after = (on.get(addDays(end, 1)) ?? []).filter((item) => item.entityType === "exam_paper" || (item.entityType === "school_item" && item.attributes.kind === "exam"));
      if (during.length === 0 && after.length === 0) {
        clear.push(label);
        continue;
      }
      if (blocked.length >= 3) continue;
      const reasons = [
        ...during.map((item) => `${what(item)} (${shortDay(String(item.attributes.date ?? start))})`),
        ...after.map((item) => `${what(item)} the day after (${shortDay(addDays(end, 1))})`),
      ];
      blocked.push({ label, reasons, evidence: [...during, ...after], date: start });
    }
    // "Which are the next long weekends?" wants only those: the plain free weekends would bury them.
    const longOnly = trip.noun === "long weekend";
    const length = trip.days === 1 ? "a day out" : `a ${trip.days}-day ${trip.noun}`;
    if (!longOnly) add(
      "free_window",
      clear.length > 0
        ? `For ${length}, nothing is on the family calendar on ${listOf(clear.slice(0, 3))}${clear.length > 3 ? `, or ${count(clear.length - 3, "later weekend")}` : ""} (the next ${TRIP_WEEKS} weekends checked).`
        : `For ${length}, every one of the next ${TRIP_WEEKS} weekends has something on the family calendar.`,
      [],
      clear.length > 0 ? first : null,
    );
    if (!longOnly) for (const entry of blocked) add("free_window", `${entry.label} is less free: ${entry.reasons.join("; ")}.`, entry.evidence, entry.date);

    // Long weekends (14-034): a public holiday on a Friday or a Monday makes
    // three days; on a Thursday or a Tuesday, four, with one day taken off.
    // Over the next six months, and only where nothing is on for the family.
    const holidays = usable
      .filter((item) => item.entityType === "holiday" && typeof item.attributes.date === "string")
      .filter((item) => daysBetween(options.today, String(item.attributes.date)) > 0 && daysBetween(options.today, String(item.attributes.date)) <= LONG_WEEKEND_AHEAD_DAYS)
      .sort((a, b) => String(a.attributes.date).localeCompare(String(b.attributes.date)));
    const long: { text: string; holiday: HouseholdContextItem; date: string }[] = [];
    const seen = new Set<string>();
    for (const holiday of holidays) {
      const day = String(holiday.attributes.date);
      const weekdayIndex = new Date(`${day}T00:00:00Z`).getUTCDay();
      // [first day, last day, the day to take off]
      const shape: Record<number, [number, number, number | null]> = { 5: [0, 2, null], 1: [-2, 0, null], 4: [0, 3, 1], 2: [-3, 0, -1] };
      const window = shape[weekdayIndex];
      if (!window) continue;
      const start = addDays(day, window[0]);
      const end = addDays(day, window[1]);
      // A long weekend that has already begun is not one to plan.
      if (seen.has(start) || daysBetween(options.today, start) <= 0) continue;
      const span = Array.from({ length: daysBetween(start, end) + 1 }, (_, index) => addDays(start, index));
      if (span.some((entry) => (on.get(entry) ?? []).length > 0)) continue;
      seen.add(start);
      const off = window[2] === null ? "" : ` if ${shortDay(addDays(day, window[2]))} is taken off`;
      long.push({ text: `${shortDay(start)} to ${shortDay(end)}${off} (${holiday.attributes.title}, ${shortDay(day)})`, holiday, date: start });
    }
    if (long.length > 0) {
      // A long weekend leads: it is the best answer to "when?" when there is one.
      const firstTrip = insights.findIndex((entry) => entry.rule === "free_window");
      insights.splice(firstTrip < 0 ? insights.length : firstTrip, 0, {
        rule: "free_window",
        statement: `${LONG_WEEKENDS_LEAD} ${long.slice(0, longOnly ? 5 : 3).map((entry) => entry.text).join("; ")}.`,
        evidence: long.slice(0, longOnly ? 5 : 3).map((entry) => entry.holiday.id),
        subjectMemberIds: [],
        date: long[0]!.date,
        privacyClass: "general",
      });
    } else if (longOnly) {
      add("free_window", `No public holiday in the next six months makes a long weekend with nothing else on the family calendar.`, [], null);
    }
  }

  return insights;
}

/** How many coming weekends a "when should we go?" question looks across. */
const TRIP_WEEKS = 8;
/** How the long-weekend fact begins; the destinations after it are sized by it (`homeplaces/trip.ts`). */
export const LONG_WEEKENDS_LEAD = "Long weekends from public holidays, with nothing on the family calendar:";
/** How far ahead a public holiday can make a long weekend worth naming. */
const LONG_WEEKEND_AHEAD_DAYS = 183;

/**
 * "What's the best time for a 2-day getaway?", "when can we go on a trip?",
 * "which weekend is free for a vacation?": a question about when, for a trip
 * of a number of days. "Suggest a getaway" (where) is HomePlaces' question.
 */
export function tripQuestion(question: string): { days: number; noun: string; daysSaid: boolean } | null {
  const text = question.toLowerCase();
  // "Which are the next long weekends coming up?" asks for the long weekends themselves: three days, with no "when" word in it.
  if (/\blong[- ]weekends?\b/.test(text) && !/\b(?:what is|what's|define|meaning of)\b/.test(text)) return { days: 3, noun: "long weekend", daysSaid: false };
  const noun = text.match(/\b(getaway|trip|vacation|holiday|outing|break|staycation|day out|road ?trip|excursion)s?\b/)?.[1];
  if (!noun) return null;
  if (!/\b(?:when|best time|good time|right time|ideal time|what time|which (?:weekend|days?|dates?|week)|free (?:weekend|days?)|(?:a |the )?free|available|go away)\b/.test(text)) return null;
  // "When is the next holiday?" asks about the holiday, not a trip.
  if (noun === "holiday" && /\b(?:next|public|school|bank|upcoming|national|festival) holidays?\b/.test(text)) return null;
  // "When is the Diwali holiday?" is about the day; "a holiday", "for a 3-day holiday", "go on holiday" is a trip.
  if (noun === "holiday" && !/\b(?:a|for|on|take|family)\s+(?:[\w-]+\s+){0,2}holidays?\b/.test(text)) return null;
  if (/\b(?:where|suggest|recommend|places?|destinations?|ideas?)\b/.test(text) && !/\b(?:when|time|weekend|dates?)\b/.test(text)) return null;
  const said = text.match(/\b(\d|one|two|three|four|five)[ -]?(?:day|night)s?\b/)?.[1];
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const days = said ? (words[said] ?? Number(said)) : /\bweekend\b/.test(text) ? 2 : noun === "day out" ? 1 : 2;
  return { days: Math.min(Math.max(days, 1), 5), noun: noun === "day out" ? "trip" : noun, daysSaid: Boolean(said) };
}

function listOf(things: readonly string[]): string {
  return things.length <= 1 ? (things[0] ?? "") : `${things.slice(0, -1).join(", ")} or ${things[things.length - 1]}`;
}

function shortDay(day: string): string {
  return `${WEEKDAYS[new Date(`${day.slice(0, 10)}T00:00:00Z`).getUTCDay()]!.slice(0, 3)} ${dayOfMonth(day)}`;
}

function localDay(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function item_guests(event: HouseholdContextItem): { name: string; response: string; partySize: number }[] {
  return (event.attributes.guests as unknown[]).map((guest) => {
    const entry = guest as { name?: unknown; response?: unknown; partySize?: unknown };
    return { name: String(entry.name ?? "A guest"), response: String(entry.response ?? ""), partySize: typeof entry.partySize === "number" && entry.partySize > 0 ? entry.partySize : 1 };
  });
}

function strictest(classes: readonly PrivacyClass[]): PrivacyClass {
  return classes.reduce<PrivacyClass>((worst, next) => (PRIVACY_ORDER.indexOf(next) > PRIVACY_ORDER.indexOf(worst) ? next : worst), "general");
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

function localHour(date: Date, timezone: string): number {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(date));
  } catch {
    return date.getUTCHours();
  }
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekday(day: string): string {
  return WEEKDAYS[new Date(`${day.slice(0, 10)}T00:00:00Z`).getUTCDay()] ?? day;
}

function dayOfMonth(day: string): string {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day.slice(0, 10)}T00:00:00Z`)).replace(/(\w+) (\d+)/, "$2 $1");
}
