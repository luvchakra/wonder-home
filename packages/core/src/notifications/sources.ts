import type { Formatter } from "../i18n/format";
import { en } from "../i18n/messages/en";
import { translator } from "../i18n/translate";
import { msg, plain, renderCopy, REMINDER_MESSAGE_VERSION, type NotificationCopy, type NotificationMessage } from "./message";
import type { ReminderAnchor, ReminderPriority, TunableCategory } from "./policies";
import { localMoment, shiftDate, atLocal } from "./timing";

/**
 * What a reminder is about (story 23-001).
 *
 * Every reminder starts from a real record — an unpaid bill, a school item
 * still pending, a planned meal, the grocery list, a pet's care, a family
 * plan — and only while that record still needs someone. The moment the bill
 * is paid or the project handed in, its subject disappears, and the reconcile
 * pass resolves whatever reminder was waiting. Nothing here writes; it reads
 * the rows a domain already keeps and says what, if anything, is worth a
 * reminder.
 */

export type ReminderSourceType =
  | "obligation"
  | "school_item"
  | "school_day"
  | "meal"
  | "grocery_list"
  | "pet_care_need"
  | "family_event";

/** The source types the reconcile pass owns. Health, approvals and HomeTalk reminders keep their own writers. */
export const RECONCILED_SOURCE_TYPES: readonly ReminderSourceType[] = [
  "obligation",
  "school_item",
  "school_day",
  "meal",
  "grocery_list",
  "pet_care_need",
  "family_event",
];

export type ReminderText = {
  /** The stored English — the record, and what a reader with no message sees. */
  title: string;
  body: string;
  priority: ReminderPriority;
  /** What it says as a key and typed values, so each recipient reads it in their own language (story 22-006). */
  copy: NotificationCopy;
};

export type ReminderSubject = {
  category: TunableCategory;
  sourceType: ReminderSourceType;
  sourceId: string | null;
  /** One open reminder per recipient per thread; the thread is the dedupe key. */
  threadKey: string;
  anchor: ReminderAnchor;
  /** Past this, the reminder stops being worth showing. */
  expiresAt: Date;
  /** People named on the record itself, most responsible first. */
  owners: readonly string[];
  /** Responsibilities whose owners come next when the record names nobody. */
  outcomeKeys: readonly string[];
  /** Whose child this concerns, so their guardians can be asked. */
  childMemberId?: string;
  action: { action: string; target?: string };
  /** The records a grouped reminder stands for (story 23-008), kept so acting on it reaches each one. */
  items?: readonly string[];
  /** The words for one stage of the policy, in the household's formats. */
  text: (stageKey: string, now: Date) => ReminderText;
};

export type SourceContext = {
  timeZone: string;
  /** English, in the household's region: the formatter the stored record is written with. */
  format: Formatter;
  now: Date;
};

const ENGLISH = translator("en", en);

/** A reminder's words: the message, and the stored English rendered from it, so the two never disagree. */
export function reminderText(title: NotificationMessage, body: NotificationMessage, priority: ReminderPriority, format: Formatter): ReminderText {
  const copy: NotificationCopy = { v: REMINDER_MESSAGE_VERSION, title, body };
  return { ...renderCopy(copy, ENGLISH, format), priority, copy };
}

const endOfLocalDay = (dateKey: string, timeZone: string) => atLocal(shiftDate(dateKey, 1), 0, timeZone);

const OPEN_BILL = new Set(["expected", "received", "scheduled", "overdue"]);

export type BillRow = {
  id: string;
  name: string;
  payee: string | null;
  amount_minor: number | null;
  currency: string | null;
  due_on: string | null;
  status: string;
  responsible_member_id: string | null;
};

export function billSubject(row: BillRow, context: SourceContext): ReminderSubject | null {
  if (!row.due_on || !OPEN_BILL.has(row.status)) return null;
  const today = localMoment(context.now, context.timeZone).dateKey;
  // A bill more than a day overdue belongs to the Bills screen, not a reminder.
  if (row.due_on < shiftDate(today, -1)) return null;

  const amount = row.amount_minor !== null && row.currency ? { money: row.amount_minor / 100, currency: row.currency } : null;
  return {
    category: "bills",
    sourceType: "obligation",
    sourceId: row.id,
    // One thread per due date: a recurring bill paid this month starts next
    // month's reminders afresh rather than inheriting this month's dismissals.
    threadKey: `bill:${row.id}:${row.due_on}`,
    anchor: { kind: "day", date: row.due_on },
    expiresAt: endOfLocalDay(shiftDate(row.due_on, 1), context.timeZone),
    owners: row.responsible_member_id ? [row.responsible_member_id] : [],
    outcomeKeys: ["finance.bills_paid", "bills.paid"],
    action: { action: "pay_bill", target: row.id },
    text: (_stage, now) => {
      const days = daysBetween(localMoment(now, context.timeZone).dateKey, row.due_on!);
      const when =
        days > 1
          ? msg("reminder.bill.dueIn", { count: days })
          : msg(days === 1 ? "reminder.bill.dueTomorrow" : days === 0 ? "reminder.bill.dueToday" : "reminder.bill.wasDueYesterday");
      const params = { when: { msg: when }, date: { date: row.due_on! }, ...(amount ? { amount } : {}) };
      const body =
        days >= 0
          ? msg(amount ? "reminder.bill.bodyAmount" : "reminder.bill.body", params)
          : msg(amount ? "reminder.bill.unpaidAmount" : "reminder.bill.unpaid", params);
      return reminderText(plain(row.name), body, days <= 0 ? "high" : "medium", context.format);
    },
  };
}

const OPEN_SCHOOL = new Set(["pending", "in_progress"]);
const SCHOOL_KINDS = new Set(["homework", "worksheet", "exam", "project", "event"]);

export type SchoolItemRow = {
  id: string;
  child_member_id: string;
  kind: string;
  title: string;
  due_at: string | null;
  due_time_known: boolean;
  status: string;
};

/** A child's name as the reminder says it: their own name, or "Your child" in the reader's language when the record has none. */
function childWords(childName: string | null): NotificationMessage {
  return childName ? plain(childName) : msg("reminder.yourChild");
}

export function schoolSubject(row: SchoolItemRow, childName: string | null, context: SourceContext): ReminderSubject | null {
  if (!row.due_at || !OPEN_SCHOOL.has(row.status) || !SCHOOL_KINDS.has(row.kind)) return null;
  const dueAt = new Date(row.due_at);
  // An all-day item is stored at midnight UTC and names only its day.
  const anchor: ReminderAnchor = row.due_time_known
    ? { kind: "moment", at: dueAt }
    : { kind: "day", date: row.due_at.slice(0, 10) };
  const dueDay = anchor.kind === "day" ? anchor.date : localMoment(dueAt, context.timeZone).dateKey;
  const kind = msg(`reminder.school.kind.${row.kind}` as NotificationMessage["key"]);
  const time = row.due_time_known ? { time: dueAt.toISOString() } : null;

  return {
    category: "school",
    sourceType: "school_item",
    sourceId: row.id,
    threadKey: `school:${row.id}`,
    anchor,
    expiresAt: anchor.kind === "moment" ? dueAt : endOfLocalDay(dueDay, context.timeZone),
    owners: [],
    // Homework is whoever sees it done; anything to take in is whoever packs the bag.
    outcomeKeys: row.kind === "homework" || row.kind === "worksheet" ? ["school.homework_done", "kids.school_bag"] : ["kids.school_bag", "school.homework_done"],
    childMemberId: row.child_member_id,
    action: { action: "complete_school_item", target: row.id },
    text: (stage) => {
      const tomorrow = stage === "tonight";
      const happens = row.kind === "exam" || row.kind === "event";
      const key = happens
        ? tomorrow ? (time ? "reminder.isTomorrowAt" : "reminder.isTomorrow") : time ? "reminder.isTodayAt" : "reminder.isToday"
        : tomorrow ? (time ? "reminder.dueTomorrowBy" : "reminder.dueTomorrow") : time ? "reminder.dueTodayBy" : "reminder.dueToday";
      return reminderText(
        msg("reminder.school.title", { child: { msg: childWords(childName) }, kind: { msg: kind } }),
        msg(key, { title: row.title, ...(time ? { time } : {}) }),
        row.kind === "event" ? "low" : "medium",
        context.format,
      );
    },
  };
}

const OPEN_MEAL = new Set(["planned", "at_risk"]);
/** When there is no recipe to say how long cooking takes, assume this much. */
export const DEFAULT_PREP_MINUTES = 45;

export type MealRow = {
  id: string;
  name: string;
  slot: string;
  ready_by: string;
  status: string;
  cook_member_id: string | null;
  recipe_total_minutes: number | null;
};

const MEAL_SLOTS = new Set(["breakfast", "lunch", "snack", "dinner"]);

export function mealSubject(row: MealRow, context: SourceContext): ReminderSubject | null {
  if (!OPEN_MEAL.has(row.status)) return null;
  const readyBy = new Date(row.ready_by);
  const minutes = row.recipe_total_minutes ?? DEFAULT_PREP_MINUTES;
  const startBy = new Date(readyBy.getTime() - minutes * 60_000);
  const slot: NotificationMessage = MEAL_SLOTS.has(row.slot)
    ? msg(`reminder.meal.slot.${row.slot}` as NotificationMessage["key"])
    : plain(row.slot.charAt(0).toUpperCase() + row.slot.slice(1));

  return {
    category: "meals",
    sourceType: "meal",
    sourceId: row.id,
    threadKey: `meal:${row.id}`,
    anchor: { kind: "moment", at: startBy },
    expiresAt: readyBy,
    owners: row.cook_member_id ? [row.cook_member_id] : [],
    outcomeKeys: [`meals.${row.slot}_ready`, "meals.dinner_ready"],
    action: { action: "view_meal", target: row.id },
    text: () =>
      reminderText(
        msg("reminder.meal.title", { slot: { msg: slot } }),
        row.recipe_total_minutes
          ? msg("reminder.meal.bodyMinutes", { meal: row.name, slot: { msg: slot }, time: { time: readyBy.toISOString() }, minutes: row.recipe_total_minutes })
          : msg("reminder.meal.body", { meal: row.name, slot: { msg: slot }, time: { time: readyBy.toISOString() } }),
        row.slot === "dinner" ? "high" : "medium",
        context.format,
      ),
  };
}

export type GroceryNeedRow = { name: string; needed_by: string | null; category: string };

/**
 * The whole list as one reminder (story 23-006): "Milk, bread and eggs are
 * running low" rather than three interruptions. One per local day, so a list
 * dismissed today can still come back tomorrow.
 */
export function grocerySubject(needs: readonly GroceryNeedRow[], context: SourceContext): ReminderSubject | null {
  if (needs.length === 0) return null;
  const today = localMoment(context.now, context.timeZone).dateKey;
  const names = needs.map((need) => need.name);
  const listed =
    names.length <= 4 ? { list: names } : { msg: msg("reminder.grocery.andMore", { items: names.slice(0, 3).join(", "), count: names.length - 3 }) };
  const urgent = needs.some((need) => need.category === "medical" || (need.needed_by !== null && need.needed_by <= today));

  return {
    category: "groceries",
    sourceType: "grocery_list",
    sourceId: null,
    threadKey: `grocery_list:${today}`,
    anchor: { kind: "day", date: today },
    expiresAt: endOfLocalDay(today, context.timeZone),
    owners: [],
    outcomeKeys: ["groceries.stocked", "groceries.list_updated"],
    action: { action: "view_grocery_list" },
    text: () =>
      reminderText(msg("reminder.grocery.title"), msg("reminder.grocery.low", { items: listed, count: names.length }), urgent ? "medium" : "low", context.format),
  };
}

const PET_KINDS = new Set(["food", "litter", "medication", "vet_visit", "grooming", "exercise"]);
const PET_OUTCOME: Record<string, string> = {
  food: "pets.fed",
  litter: "pets.litter",
  medication: "pets.vet",
  vet_visit: "pets.vet",
  grooming: "pets.walked",
  exercise: "pets.walked",
};

export type PetCareRow = {
  id: string;
  kind: string;
  due_on: string | null;
  last_done_on: string | null;
  interval_days: number | null;
  responsible_member_id: string | null;
  pet_name: string;
};

/** The day this care is next due, only when the record actually says so. */
export function petCareDueOn(row: Pick<PetCareRow, "due_on" | "last_done_on" | "interval_days">): string | null {
  // A one-off need already done on (or after) its date is finished.
  if (row.due_on) return row.last_done_on && row.last_done_on >= row.due_on ? null : row.due_on;
  if (row.last_done_on && row.interval_days) return shiftDate(row.last_done_on, row.interval_days);
  return null;
}

export function petSubject(row: PetCareRow, context: SourceContext): ReminderSubject | null {
  const due = petCareDueOn(row);
  if (!due || !PET_KINDS.has(row.kind)) return null;
  const today = localMoment(context.now, context.timeZone).dateKey;
  // Overdue care is the Home & Upkeep screen's to show; a reminder is ahead of time.
  if (due < today) return null;

  return {
    category: "pets",
    sourceType: "pet_care_need",
    sourceId: row.id,
    threadKey: `pet_care:${row.id}:${due}`,
    anchor: { kind: "day", date: due },
    expiresAt: endOfLocalDay(due, context.timeZone),
    owners: row.responsible_member_id ? [row.responsible_member_id] : [],
    outcomeKeys: [PET_OUTCOME[row.kind]!],
    action: { action: "view_pet_care", target: row.id },
    text: (stage) => {
      const kind = { msg: msg(`reminder.pet.kind.${row.kind}` as NotificationMessage["key"]) };
      return reminderText(
        msg("reminder.pet.title", { pet: row.pet_name, kind }),
        msg(stage === "due_tomorrow" ? "reminder.dueTomorrow" : "reminder.dueToday", { title: kind }),
        row.kind === "medication" ? "high" : "medium",
        context.format,
      );
    },
  };
}

const OPEN_EVENT = new Set(["proposed", "planned", "confirmed"]);
const DAY_EVENTS = new Set(["birthday", "special_occasion"]);

export type FamilyEventRow = {
  id: string;
  title: string;
  kind: string;
  starts_at: string;
  status: string;
  owner_member_id: string | null;
};

export function familySubject(row: FamilyEventRow, context: SourceContext): ReminderSubject | null {
  // Appointments already have their own reminders through Health.
  if (!OPEN_EVENT.has(row.status) || row.kind === "appointment") return null;
  const startsAt = new Date(row.starts_at);
  if (startsAt <= context.now) return null;
  const allDay = DAY_EVENTS.has(row.kind);
  const day = localMoment(startsAt, context.timeZone).dateKey;

  return {
    category: "family",
    sourceType: "family_event",
    sourceId: row.id,
    threadKey: `family_event:${row.id}`,
    anchor: allDay ? { kind: "day", date: day } : { kind: "moment", at: startsAt },
    expiresAt: allDay ? endOfLocalDay(day, context.timeZone) : startsAt,
    owners: row.owner_member_id ? [row.owner_member_id] : [],
    outcomeKeys: [],
    action: { action: "view_event", target: row.id },
    text: (stage) =>
      reminderText(
        plain(row.title),
        allDay
          ? msg(stage === "tomorrow" ? "reminder.isTomorrow" : "reminder.isToday", { title: row.title })
          : msg(stage === "tomorrow" ? "reminder.family.startsTomorrowAt" : "reminder.family.startsAt", { time: { time: startsAt.toISOString() } }),
        "low",
        context.format,
      ),
  };
}

/**
 * A child's school things due the same day, as one reminder (story 23-008):
 * "Aarav — 3 things for tomorrow" rather than three interruptions. Only for
 * items that would go to the same person anyway; the grouped reminder is as
 * urgent as the most urgent thing in it, so nothing critical is hidden in it.
 */
export function schoolDaySubject(
  items: readonly { row: SchoolItemRow; subject: ReminderSubject }[],
  childName: string | null,
  context: SourceContext,
): ReminderSubject | null {
  if (items.length < 2) return null;
  const sorted = [...items].sort((a, b) => anchorTime(a.subject, context.timeZone) - anchorTime(b.subject, context.timeZone));
  const first = sorted[0]!;
  const day = anchorDay(first.subject, context.timeZone);
  const expiresAt = new Date(Math.max(...sorted.map((item) => item.subject.expiresAt.getTime())));
  const titles = sorted.map(({ row }) => row.title);
  const rank = { high: 2, medium: 1, low: 0 } as const;

  return {
    category: "school",
    sourceType: "school_day",
    // The child the day is about: a real record, and the same for every item.
    sourceId: first.row.child_member_id,
    threadKey: `school_day:${first.row.child_member_id}:${day}`,
    anchor: first.subject.anchor,
    expiresAt,
    owners: [],
    outcomeKeys: first.subject.outcomeKeys,
    childMemberId: first.row.child_member_id,
    action: { action: "view_school_day", target: first.row.child_member_id },
    items: sorted.map(({ row }) => row.id),
    text: (stage, now) => {
      const priority = sorted
        .map(({ subject }) => subject.text(stage, now).priority)
        .reduce((top, next) => (rank[next] > rank[top] ? next : top), "low" as ReminderText["priority"]);
      return reminderText(
        msg(stage === "tonight" ? "reminder.schoolDay.tomorrow" : "reminder.schoolDay.today", { child: { msg: childWords(childName) }, count: sorted.length }),
        msg("reminder.schoolDay.body", { items: { list: titles } }),
        priority,
        context.format,
      );
    },
  };
}

function anchorTime(subject: ReminderSubject, timeZone: string): number {
  return subject.anchor.kind === "moment" ? subject.anchor.at.getTime() : atLocal(subject.anchor.date, 0, timeZone).getTime();
}

function anchorDay(subject: ReminderSubject, timeZone: string): string {
  return subject.anchor.kind === "day" ? subject.anchor.date : localMoment(subject.anchor.at, timeZone).dateKey;
}

function daysBetween(fromDateKey: string, toDateKey: string): number {
  return Math.round((Date.parse(`${toDateKey}T00:00:00Z`) - Date.parse(`${fromDateKey}T00:00:00Z`)) / 86_400_000);
}
