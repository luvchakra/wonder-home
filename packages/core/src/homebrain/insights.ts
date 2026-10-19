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

export type InsightRule = "night_before" | "meal_short" | "away_but_assigned" | "bill_before_trip" | "routine_gap" | "count";

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

  return insights;
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
