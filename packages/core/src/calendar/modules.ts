/**
 * The rest of the household on the calendar (story 26-002, design §2 (b)):
 * school, meals, bills, health, helpers, upkeep, responsibilities and grocery
 * deliveries, each projected from the record its own module keeps.
 *
 * Like the event adapters, these are pure. The repository reads through the
 * viewer's own session, so RLS has already decided which rows reach here
 * (`may_see_child`, `may_see_finance`, `may_see_health`); these functions only
 * shape them, and narrow further where the design asks for it:
 * - a bill is shown only to someone with `finance.view`, and never its amount;
 * - someone else's health appointment reads "Busy" unless the viewer is that
 *   person, their guardian, or it is shared with the whole household (D4);
 * - a due date is a marker ("Due"), a scheduled time is a block;
 * - helpers, upkeep and responsibilities link to screens only adults open, so a
 *   child sees the entry without a link that would only turn them away.
 */
import { atLocal, localMoment } from "./dates";
import type { CalendarEntry, CalendarSource, CalendarViewer } from "./projection";

/** The module sources a person can switch on and off in Filters, in the order the sheet lists them. */
export const MODULE_SOURCES = ["school", "activity", "meal", "bill", "health", "helper", "upkeep", "outcome", "order"] as const satisfies readonly CalendarSource[];
export type ModuleSource = (typeof MODULE_SOURCES)[number];

/**
 * The plan feature each module read needs (`billing/entitlements.ts`). Helpers
 * need none; classes and exams were on the calendar before this and are
 * written only from Kids & School, which already asks.
 */
export const MODULE_FEATURES: Partial<Record<ModuleSource, string>> = {
  school: "school.connector",
  meal: "meals.planning",
  bill: "finance.bills",
  health: "health.tracking",
  upkeep: "home.maintenance",
  outcome: "household.outcomes",
  order: "commerce.orders",
};

/** What decides which module entries this viewer gets, beyond RLS. */
export type ModuleViewer = CalendarViewer & {
  /** Holds `finance.view`. */
  financeView: boolean;
  /** An adult (not a child or a helper): helpers, upkeep and responsibilities open adult screens. */
  adult: boolean;
  /** The children this viewer is a guardian of. */
  guardianOf: readonly string[];
};

export type ModuleWords = {
  /** "Dentist" — a health appointment's kind, for whoever may see it. */
  appointment: (appointmentType: string) => string;
  /** Someone else's appointment the viewer may not see the details of. */
  busy: string;
  /** "Rekha away". */
  helperAway: (name: string) => string;
  /** "Delivery · Blinkit". */
  delivery: (provider: string) => string;
};

type Range = { from: string; to: string };

const HOUR = 60 * 60_000;

function base(viewer: CalendarViewer) {
  return {
    timeZone: viewer.timeZone,
    ownerMemberId: null,
    status: "confirmed" as const,
    visibility: "household" as const,
    occurrenceDate: null,
    repeats: false,
    protected: false,
    can: { edit: false },
  };
}

function inRange(at: Date, range: Range, timeZone: string): boolean {
  const day = localMoment(at, timeZone).dateKey;
  return day >= range.from && day <= range.to;
}

// --- School -----------------------------------------------------------------

export type SchoolItemRecord = {
  id: string;
  childMemberId: string;
  kind: string;
  title: string;
  subject: string | null;
  status: string;
  dueAt: Date | null;
  dueTimeKnown: boolean;
  endsAt: Date | null;
};

const SCHOOL_BLOCKS = new Set(["event", "exam"]);
const SCHOOL_DUE = new Set(["homework", "worksheet", "project"]);
const SCHOOL_HANDLED = new Set(["done", "submitted", "cancelled"]);

/** Exams and school events as blocks; homework, worksheets and projects as "Due" markers while still to do. Notices stay on Kids & School. */
export function schoolItemEntries(items: readonly SchoolItemRecord[], viewer: CalendarViewer, range: Range): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const item of items) {
    if (!item.dueAt || !inRange(item.dueAt, range, viewer.timeZone)) continue;
    const block = SCHOOL_BLOCKS.has(item.kind);
    if (!block && !SCHOOL_DUE.has(item.kind)) continue;
    if (item.status === "cancelled" || (!block && SCHOOL_HANDLED.has(item.status))) continue;
    const day = localMoment(item.dueAt, viewer.timeZone).dateKey;
    const allDay = !item.dueTimeKnown;
    const start = allDay ? atLocal(day, 0, viewer.timeZone) : item.dueAt;
    entries.push({
      ...base(viewer),
      id: `school:${item.id}`,
      source: "school",
      sourceId: item.id,
      title: item.title,
      detail: item.subject,
      start,
      end: block ? (allDay ? atLocal(day, 24 * 60, viewer.timeZone) : item.endsAt && item.endsAt > item.dueAt ? item.endsAt : new Date(item.dueAt.getTime() + HOUR)) : null,
      allDay,
      kind: block ? "block" : "due",
      category: "school",
      memberIds: [item.childMemberId],
      href: `/school?child=${item.childMemberId}`,
    });
  }
  return entries;
}

// --- Meals ------------------------------------------------------------------

export type MealRecord = { id: string; name: string; readyBy: Date; cookMemberId: string | null; status: string };

/** A planned meal as a light marker at the time it should be ready. Off by default (D6). */
export function mealEntries(meals: readonly MealRecord[], viewer: CalendarViewer, range: Range): CalendarEntry[] {
  return meals
    .filter((meal) => meal.status !== "skipped" && meal.status !== "replanned" && inRange(meal.readyBy, range, viewer.timeZone))
    .map((meal) => ({
      ...base(viewer),
      id: `meal:${meal.id}`,
      source: "meal",
      sourceId: meal.id,
      title: meal.name,
      detail: null,
      start: meal.readyBy,
      end: null,
      allDay: false,
      kind: "marker",
      category: "meals",
      memberIds: [],
      ownerMemberId: meal.cookMemberId,
      href: "/meals",
    }));
}

// --- Bills ------------------------------------------------------------------

export type BillRecord = { id: string; name: string; dueOn: string | null; status: string; responsibleMemberId: string | null };

const BILL_CLOSED = new Set(["paid", "waived", "cancelled"]);

/** A bill still to pay, as a "Due" marker on its day: only with `finance.view`, and never its amount. */
export function billEntries(bills: readonly BillRecord[], viewer: ModuleViewer, range: Range): CalendarEntry[] {
  if (!viewer.financeView) return [];
  return bills
    .filter((bill): bill is BillRecord & { dueOn: string } => bill.dueOn !== null && bill.dueOn >= range.from && bill.dueOn <= range.to && !BILL_CLOSED.has(bill.status))
    .map((bill) => ({
      ...base(viewer),
      id: `bill:${bill.id}`,
      source: "bill",
      sourceId: bill.id,
      title: bill.name,
      detail: null,
      start: atLocal(bill.dueOn, 0, viewer.timeZone),
      end: null,
      allDay: true,
      kind: "due",
      category: "household",
      memberIds: [],
      ownerMemberId: bill.responsibleMemberId,
      href: "/bills",
    }));
}

// --- Health -----------------------------------------------------------------

export type AppointmentRecord = {
  id: string;
  memberId: string;
  appointmentType: string;
  status: string;
  privacyScope: string;
  startsAt: Date;
  endsAt: Date | null;
  provider: string | null;
  facility: string | null;
  familyEventId: string | null;
};

/** Whether the viewer sees what an appointment is, or only that the person is busy (D4). */
export function seesAppointment(appointment: Pick<AppointmentRecord, "memberId" | "privacyScope">, viewer: ModuleViewer): boolean {
  return appointment.memberId === viewer.memberId || viewer.guardianOf.includes(appointment.memberId) || appointment.privacyScope === "household_operational";
}

/**
 * Appointments RLS let through (`may_see_health`): the viewer's own, a child's
 * for their guardian, and what someone shared. Anyone else's reads "Busy",
 * with no kind, place or link. One already on the calendar as a family event
 * shows once, as that event.
 */
export function appointmentEntries(
  appointments: readonly AppointmentRecord[],
  viewer: ModuleViewer,
  range: Range,
  words: Pick<ModuleWords, "appointment" | "busy">,
  shownEventIds: ReadonlySet<string> = new Set(),
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const appointment of appointments) {
    if (appointment.status !== "proposed" && appointment.status !== "confirmed") continue;
    if (appointment.familyEventId && shownEventIds.has(appointment.familyEventId)) continue;
    if (!inRange(appointment.startsAt, range, viewer.timeZone)) continue;
    const sees = seesAppointment(appointment, viewer);
    entries.push({
      ...base(viewer),
      id: `health:${appointment.id}`,
      source: "health",
      sourceId: appointment.id,
      title: sees ? words.appointment(appointment.appointmentType) : words.busy,
      detail: sees ? (appointment.provider ?? appointment.facility) : null,
      start: appointment.startsAt,
      end: appointment.endsAt && appointment.endsAt > appointment.startsAt ? appointment.endsAt : new Date(appointment.startsAt.getTime() + HOUR),
      allDay: false,
      kind: "block",
      category: "health",
      memberIds: [appointment.memberId],
      status: appointment.status === "proposed" ? "proposed" : "confirmed",
      visibility: sees ? "household" : "private",
      href: sees ? "/health" : null,
    });
  }
  return entries;
}

// --- Helpers ----------------------------------------------------------------

export type HelperAbsenceRecord = { memberId: string; onDate: string; available: boolean };
export type HelperRecord = { id: string; displayName: string };

/** "Rekha away" on each day a helper said they won't come. */
export function helperEntries(absences: readonly HelperAbsenceRecord[], helpers: readonly HelperRecord[], viewer: ModuleViewer, range: Range, words: Pick<ModuleWords, "helperAway">): CalendarEntry[] {
  const names = new Map(helpers.map((helper) => [helper.id, helper.displayName]));
  return absences
    .filter((absence) => !absence.available && names.has(absence.memberId) && absence.onDate >= range.from && absence.onDate <= range.to)
    .map((absence) => ({
      ...base(viewer),
      id: `helper:${absence.memberId}:${absence.onDate}`,
      source: "helper",
      sourceId: absence.memberId,
      title: words.helperAway(names.get(absence.memberId)!),
      detail: null,
      start: atLocal(absence.onDate, 0, viewer.timeZone),
      end: atLocal(absence.onDate, 24 * 60, viewer.timeZone),
      allDay: true,
      kind: "marker",
      category: "household",
      memberIds: [absence.memberId],
      occurrenceDate: absence.onDate,
      href: viewer.adult ? "/househelper" : null,
    }));
}

// --- Upkeep -----------------------------------------------------------------

export type ServiceVisitRecord = { id: string; subject: string; providerName: string | null; status: string; scheduledFor: Date | null };

/** A booked service visit, at its time. Requests not yet booked stay on the home screen. */
export function upkeepEntries(visits: readonly ServiceVisitRecord[], viewer: ModuleViewer, range: Range): CalendarEntry[] {
  return visits
    .filter((visit): visit is ServiceVisitRecord & { scheduledFor: Date } =>
      visit.scheduledFor !== null && visit.status !== "completed" && visit.status !== "cancelled" && inRange(visit.scheduledFor, range, viewer.timeZone),
    )
    .map((visit) => ({
      ...base(viewer),
      id: `upkeep:${visit.id}`,
      source: "upkeep",
      sourceId: visit.id,
      title: visit.subject,
      detail: visit.providerName,
      start: visit.scheduledFor,
      end: null,
      allDay: false,
      kind: "marker",
      category: "household",
      memberIds: [],
      href: viewer.adult ? "/household/home" : null,
    }));
}

// --- Responsibilities -------------------------------------------------------

export type OutcomeDueRecord = { id: string; outcomeKey: string; name: string | null; status: string; ownerMemberId: string | null; dueAt: Date | null };

const OUTCOME_OPEN = new Set(["pending", "on_track", "at_risk", "blocked"]);

/** "outcome_key_name" → "Outcome key name", for an outcome the playbook has no name for. */
function readableKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** An open outcome with a due time, as a "Due" marker. Off by default (D6). */
export function outcomeEntries(outcomes: readonly OutcomeDueRecord[], viewer: ModuleViewer, range: Range): CalendarEntry[] {
  return outcomes
    .filter((outcome): outcome is OutcomeDueRecord & { dueAt: Date } => outcome.dueAt !== null && OUTCOME_OPEN.has(outcome.status) && inRange(outcome.dueAt, range, viewer.timeZone))
    .map((outcome) => ({
      ...base(viewer),
      id: `outcome:${outcome.id}`,
      source: "outcome",
      sourceId: outcome.id,
      title: outcome.name ?? readableKey(outcome.outcomeKey),
      detail: null,
      start: outcome.dueAt,
      end: null,
      allDay: false,
      kind: "due",
      category: "household",
      memberIds: outcome.ownerMemberId ? [outcome.ownerMemberId] : [],
      ownerMemberId: outcome.ownerMemberId,
      href: viewer.adult ? "/household/responsibilities" : null,
    }));
}

// --- Grocery deliveries -----------------------------------------------------

export type OrderRecord = { id: string; provider: string; status: string; expectedAt: Date | null };

const ORDER_ON_ITS_WAY = new Set(["placed", "confirmed", "shipped"]);

/** An order on its way, at the time it is expected. Never its items or a use-by date. */
export function orderEntries(orders: readonly OrderRecord[], viewer: ModuleViewer, range: Range, words: Pick<ModuleWords, "delivery">): CalendarEntry[] {
  return orders
    .filter((order): order is OrderRecord & { expectedAt: Date } => order.expectedAt !== null && ORDER_ON_ITS_WAY.has(order.status) && inRange(order.expectedAt, range, viewer.timeZone))
    .map((order) => ({
      ...base(viewer),
      id: `order:${order.id}`,
      source: "order",
      sourceId: order.id,
      title: words.delivery(order.provider),
      detail: null,
      start: order.expectedAt,
      end: null,
      allDay: false,
      kind: "marker",
      category: "household",
      memberIds: [],
      href: viewer.adult ? "/groceries" : null,
    }));
}
