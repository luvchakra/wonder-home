import type { Formatter } from "../i18n/format";
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

export type ReminderSourceType = "obligation" | "school_item" | "meal" | "grocery_list" | "pet_care_need" | "family_event";

/** The source types the reconcile pass owns. Health, approvals and HomeTalk reminders keep their own writers. */
export const RECONCILED_SOURCE_TYPES: readonly ReminderSourceType[] = [
  "obligation",
  "school_item",
  "meal",
  "grocery_list",
  "pet_care_need",
  "family_event",
];

export type ReminderText = {
  title: string;
  body: string;
  priority: ReminderPriority;
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
  /** The words for one stage of the policy, in the household's formats. */
  text: (stageKey: string, now: Date) => ReminderText;
};

export type SourceContext = {
  timeZone: string;
  format: Formatter;
  now: Date;
};

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

  const amount = row.amount_minor !== null && row.currency ? context.format.money(row.amount_minor / 100, row.currency) : null;
  const dueDate = context.format.date(row.due_on);
  return {
    category: "bills",
    sourceType: "obligation",
    sourceId: row.id,
    threadKey: `bill:${row.id}`,
    anchor: { kind: "day", date: row.due_on },
    expiresAt: endOfLocalDay(shiftDate(row.due_on, 1), context.timeZone),
    owners: row.responsible_member_id ? [row.responsible_member_id] : [],
    outcomeKeys: ["finance.bills_paid", "bills.paid"],
    action: { action: "pay_bill", target: row.id },
    text: (_stage, now) => {
      const days = daysBetween(localMoment(now, context.timeZone).dateKey, row.due_on!);
      const when =
        days > 1 ? `Due in ${days} days` : days === 1 ? "Due tomorrow" : days === 0 ? "Due today" : "Was due yesterday";
      return {
        title: row.name,
        body: `${when}${amount ? ` · ${amount}` : ""}. ${days >= 0 ? `Pay by ${dueDate}.` : "It still shows as unpaid."}`,
        priority: days <= 0 ? "high" : "medium",
      };
    },
  };
}

const OPEN_SCHOOL = new Set(["pending", "in_progress"]);
const SCHOOL_NOUN: Record<string, string> = {
  homework: "Homework",
  worksheet: "Worksheet",
  exam: "Exam",
  project: "Project",
  event: "School event",
};

export type SchoolItemRow = {
  id: string;
  child_member_id: string;
  kind: string;
  title: string;
  due_at: string | null;
  due_time_known: boolean;
  status: string;
};

export function schoolSubject(row: SchoolItemRow, childName: string, context: SourceContext): ReminderSubject | null {
  if (!row.due_at || !OPEN_SCHOOL.has(row.status) || !(row.kind in SCHOOL_NOUN)) return null;
  const dueAt = new Date(row.due_at);
  // An all-day item is stored at midnight UTC and names only its day.
  const anchor: ReminderAnchor = row.due_time_known
    ? { kind: "moment", at: dueAt }
    : { kind: "day", date: row.due_at.slice(0, 10) };
  const dueDay = anchor.kind === "day" ? anchor.date : localMoment(dueAt, context.timeZone).dateKey;
  const noun = SCHOOL_NOUN[row.kind]!;
  const time = row.due_time_known ? context.format.time(dueAt) : null;

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
      const whenWord = tomorrow ? "tomorrow" : "today";
      const body =
        row.kind === "exam"
          ? `${row.title} is ${whenWord}${time ? ` at ${time}` : ""}.`
          : row.kind === "event"
            ? `${row.title} is ${whenWord}${time ? ` at ${time}` : ""}.`
            : `${row.title} is due ${whenWord}${time ? ` by ${time}` : ""}.`;
      return {
        title: `${childName} — ${noun}`,
        body,
        priority: row.kind === "event" ? "low" : "medium",
      };
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

export function mealSubject(row: MealRow, context: SourceContext): ReminderSubject | null {
  if (!OPEN_MEAL.has(row.status)) return null;
  const readyBy = new Date(row.ready_by);
  const minutes = row.recipe_total_minutes ?? DEFAULT_PREP_MINUTES;
  const startBy = new Date(readyBy.getTime() - minutes * 60_000);
  const slot = row.slot.charAt(0).toUpperCase() + row.slot.slice(1);

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
    text: () => ({
      title: `${slot} preparation`,
      body: `Start preparing ${row.name}. ${slot} is planned for ${context.format.time(readyBy)}${
        row.recipe_total_minutes ? `, and it takes about ${row.recipe_total_minutes} minutes` : ""
      }.`,
      priority: row.slot === "dinner" ? "high" : "medium",
    }),
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
  const listed = names.length <= 4 ? joinWords(names) : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
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
    text: () => ({
      title: "Grocery list needs attention",
      body: `${listed} ${names.length === 1 ? "is" : "are"} running low.`,
      priority: urgent ? "medium" : "low",
    }),
  };
}

const PET_NOUN: Record<string, string> = {
  food: "Food",
  litter: "Litter",
  medication: "Medication",
  vet_visit: "Vet visit",
  grooming: "Grooming",
  exercise: "Exercise",
};
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
  if (row.due_on) return row.due_on;
  if (row.last_done_on && row.interval_days) return shiftDate(row.last_done_on, row.interval_days);
  return null;
}

export function petSubject(row: PetCareRow, context: SourceContext): ReminderSubject | null {
  const due = petCareDueOn(row);
  if (!due || !(row.kind in PET_NOUN)) return null;
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
    text: (stage) => ({
      title: `${row.pet_name} — ${PET_NOUN[row.kind]}`,
      body: `${PET_NOUN[row.kind]} is due ${stage === "due_tomorrow" ? "tomorrow" : "today"}.`,
      priority: row.kind === "medication" ? "high" : "medium",
    }),
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
    text: (stage) => ({
      title: row.title,
      body: allDay
        ? `${row.title} is ${stage === "tomorrow" ? "tomorrow" : "today"}.`
        : `Starts ${stage === "tomorrow" ? "tomorrow at" : "at"} ${context.format.time(startsAt)}.`,
      priority: "low",
    }),
  };
}

function daysBetween(fromDateKey: string, toDateKey: string): number {
  return Math.round((Date.parse(`${toDateKey}T00:00:00Z`) - Date.parse(`${fromDateKey}T00:00:00Z`)) / 86_400_000);
}

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
