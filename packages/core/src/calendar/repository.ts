import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { may } from "../billing/repository";
import { invalidatesContext } from "../context/invalidation";
import { activityEntries, listActivities } from "../school/activities";
import { examEntries, listExams } from "../school/exams";
import { rangeInstants, isDateKey } from "./dates";
import {
  appointmentEntries,
  billEntries,
  helperEntries,
  mealEntries,
  MODULE_FEATURES,
  MODULE_SOURCES,
  orderEntries,
  outcomeEntries,
  schoolItemEntries,
  upkeepEntries,
  type AppointmentRecord,
  type BillRecord,
  type HelperAbsenceRecord,
  type MealRecord,
  type ModuleSource,
  type ModuleViewer,
  type ModuleWords,
  type OrderRecord,
  type OutcomeDueRecord,
  type SchoolItemRecord,
  type ServiceVisitRecord,
} from "./modules";
import {
  DEFAULT_FILTERS,
  effectiveHolidayRegion,
  parsePreferences,
  type CalendarFilters,
  type CalendarPreferences,
} from "./preferences";
import {
  eventEntries,
  holidayEntries,
  mergeEntries,
  occasionEntries,
  type CalendarEntry,
  type CalendarEventRecord,
  type CalendarSource,
  type CalendarViewer,
  type EventCategory,
  type EventVisibility,
  type HolidayRecord,
  type OccasionMember,
  type OccasionWords,
} from "./projection";
import { parseRecurrence, type OccurrenceException } from "./recurrence";

/**
 * Reading the Family Calendar (story 12-009, design §3.1).
 *
 * `calendarRange` runs each adapter through the member's own client, so RLS
 * decides what is visible — a private event never leaves the database for
 * anybody but its owner. A source that cannot be read is reported by name and
 * the rest still shows ("Some sources could not be read"), never a blank month
 * that looks like a free one.
 */

type Row = Record<string, unknown>;

/** Rows the retired-in-place occasion trigger wrote; occasions are now projected from members. */
const SYNCED_OCCASION = /^member_(birthday|special_occasion):/;

export type CalendarRangeResult = {
  entries: CalendarEntry[];
  failedSources: CalendarSource[];
  /** The modules this person could switch on in Filters: allowed to them and in the plan. Empty without `modules`. */
  offeredSources?: ModuleSource[];
};

export type CalendarRangeInput = {
  householdId: string;
  householdRegion: string | null;
  viewer: CalendarViewer;
  from: string;
  to: string;
  holidayRegion: string | null;
  words: OccasionWords;
  /**
   * The other modules' entries (26-002), for the calendar screen. Left out, only
   * events, occasions, holidays, classes and exams are read — what a clash
   * check or a HomeTalk span needs.
   */
  modules?: {
    /** Sources this person hides in Filters: never read. */
    hidden: readonly CalendarSource[];
    financeView: boolean;
    adult: boolean;
    words: ModuleWords;
  };
};

/** The longest range one read may ask for: a year, for the Year view's counts. */
export const MAX_RANGE_DAYS = 366;

export async function calendarRange(supabase: SupabaseClient, input: CalendarRangeInput): Promise<CalendarRangeResult> {
  if (!isDateKey(input.from) || !isDateKey(input.to) || input.from > input.to) throw ApiError.badRequest("That is not a date range.");
  const range = { from: input.from, to: input.to };
  const failedSources: CalendarSource[] = [];

  const settle = async <T>(source: CalendarSource, work: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await work();
    } catch {
      failedSources.push(source);
      return [];
    }
  };

  const region = effectiveHolidayRegion(input.holidayRegion, input.householdRegion);
  const modules = input.modules ?? null;
  const viewer = input.viewer;

  // Whether each module is in the plan, for every module at once: the answer is
  // read once per request, decides what Filters offers, and is awaited only
  // alongside the read it gates.
  const adult = modules?.adult === true;
  const allowedFor = new Map<ModuleSource, Promise<boolean>>(
    modules
      ? MODULE_SOURCES.map((source) => {
          const permitted = (source !== "bill" || modules.financeView) && (source !== "outcome" || adult);
          const feature = MODULE_FEATURES[source];
          const decision = !permitted ? Promise.resolve(false) : feature ? may(supabase, input.householdId, feature).then((answer) => answer.allowed, () => false) : Promise.resolve(true);
          return [source, decision];
        })
      : [],
  );
  const wanted = (source: ModuleSource) => modules !== null && !modules.hidden.includes(source);
  const fromModule = <T>(source: ModuleSource, read: () => Promise<T[]>): Promise<T[]> => {
    if (!wanted(source)) return Promise.resolve([]);
    return settle(source, async () => {
      const [allowed, rows] = await Promise.all([allowedFor.get(source)!, read()]);
      return allowed ? rows : [];
    });
  };

  const [events, members, holidays, activities, exams, schoolItems, meals, bills, appointments, guardianOf, absences, visits, outcomes, orders] = await Promise.all([
    settle("event", () => readEvents(supabase, input.householdId, range, viewer.timeZone)),
    settle("occasion", () => readOccasionMembers(supabase, input.householdId)),
    region ? settle("holiday", () => readHolidays(supabase, region, range)) : Promise.resolve([] as HolidayRecord[]),
    // A child's classes outside school, on the days they meet (08-012); RLS keeps them to the child, guardians and Admins.
    modules?.hidden.includes("activity") ? Promise.resolve([]) : settle("activity", () => listActivities(supabase, input.householdId)),
    // Each exam paper on its day (08-015); RLS keeps them to the child, guardians and Admins.
    modules?.hidden.includes("school") ? Promise.resolve([]) : settle("school", () => listExams(supabase, input.householdId)),
    fromModule("school", () => readSchoolItems(supabase, input.householdId, range, viewer.timeZone)),
    fromModule("meal", () => readMeals(supabase, input.householdId, range)),
    fromModule("bill", () => readBills(supabase, input.householdId, range)),
    fromModule("health", () => readAppointments(supabase, input.householdId, range, viewer.timeZone)),
    wanted("health") ? readGuardianOf(supabase, input.householdId, viewer.memberId) : Promise.resolve([] as string[]),
    fromModule("helper", () => readHelperAbsences(supabase, input.householdId, range)),
    fromModule("upkeep", () => readServiceVisits(supabase, input.householdId, range, viewer.timeZone)),
    fromModule("outcome", () => readOutcomes(supabase, input.householdId, range, viewer.timeZone)),
    fromModule("order", () => readOrders(supabase, input.householdId, range, viewer.timeZone)),
  ]);

  const eventList = eventEntries(events, viewer, range);
  const moduleViewer: ModuleViewer = { ...viewer, financeView: modules?.financeView === true, adult, guardianOf };
  const words = modules?.words;
  const helpers = members.filter((member) => member.memberType === "helper");

  return {
    entries: mergeEntries(
      eventList,
      occasionEntries(members, viewer, range, input.words),
      holidayEntries(holidays, viewer),
      activityEntries(activities, viewer, range),
      examEntries(exams, viewer, range),
      schoolItemEntries(schoolItems, viewer, range),
      mealEntries(meals, viewer, range),
      billEntries(bills, moduleViewer, range),
      words ? appointmentEntries(appointments, moduleViewer, range, words, new Set(eventList.map((entry) => entry.sourceId))) : [],
      words ? helperEntries(absences, helpers, moduleViewer, range, words) : [],
      upkeepEntries(visits, moduleViewer, range),
      outcomeEntries(outcomes, moduleViewer, range),
      words ? orderEntries(orders, moduleViewer, range, words) : [],
    ),
    failedSources,
    offeredSources: (await Promise.all(MODULE_SOURCES.map(async (source) => ((await allowedFor.get(source)) ? source : null)))).filter(
      (source): source is ModuleSource => source !== null,
    ),
  };
}

const EVENT_COLUMNS =
  "id, title, kind, category, starts_at, ends_at, all_day, timezone, visibility, recurrence, status, owner_member_id, protected, location, external_id, event_participants(member_id, response)";

async function readEvents(supabase: SupabaseClient, householdId: string, range: { from: string; to: string }, timeZone: string): Promise<CalendarEventRecord[]> {
  // A day either side, so an event in another time zone is never cut off at the edge.
  const { start, end } = rangeInstants(range.from, range.to, timeZone);
  const from = new Date(start.getTime() - 86_400_000).toISOString();
  const to = new Date(end.getTime() + 86_400_000).toISOString();

  const [oneOff, repeating] = await Promise.all([
    supabase
      .from("family_events")
      .select(EVENT_COLUMNS)
      .eq("household_id", householdId)
      .is("recurrence", null)
      .is("soft_deleted_at", null)
      .neq("status", "cancelled")
      .lt("starts_at", to)
      .gt("ends_at", from)
      .order("starts_at", { ascending: true })
      .limit(1000),
    supabase
      .from("family_events")
      .select(EVENT_COLUMNS)
      .eq("household_id", householdId)
      .not("recurrence", "is", null)
      .is("soft_deleted_at", null)
      .neq("status", "cancelled")
      .lt("starts_at", to)
      .limit(500),
  ]);
  if (oneOff.error) throw new Error(`calendar events failed: ${oneOff.error.code ?? "unknown"}`);
  if (repeating.error) throw new Error(`calendar events failed: ${repeating.error.code ?? "unknown"}`);

  const repeatingRows = (repeating.data as Row[] | null) ?? [];
  const exceptions = new Map<string, OccurrenceException[]>();
  if (repeatingRows.length > 0) {
    const { data, error } = await supabase
      .from("event_exceptions")
      .select("event_id, occurrence_date, cancelled, title, starts_at, ends_at, location")
      .eq("household_id", householdId)
      .in("event_id", repeatingRows.map((row) => row.id as string));
    if (error) throw new Error(`calendar exceptions failed: ${error.code ?? "unknown"}`);
    for (const row of (data as Row[] | null) ?? []) {
      const list = exceptions.get(row.event_id as string) ?? [];
      list.push({
        occurrenceDate: row.occurrence_date as string,
        cancelled: row.cancelled === true,
        title: (row.title as string | null) ?? null,
        location: (row.location as string | null) ?? null,
        startsAt: row.starts_at ? new Date(row.starts_at as string) : null,
        endsAt: row.ends_at ? new Date(row.ends_at as string) : null,
      });
      exceptions.set(row.event_id as string, list);
    }
  }

  return [...((oneOff.data as Row[] | null) ?? []), ...repeatingRows]
    .filter((row) => !SYNCED_OCCASION.test((row.external_id as string | null) ?? ""))
    .map((row) => toEventRecord(row, exceptions.get(row.id as string) ?? []));
}

export function toEventRecord(row: Row, exceptions: OccurrenceException[] = []): CalendarEventRecord {
  return {
    id: row.id as string,
    title: row.title as string,
    kind: row.kind as string,
    category: (row.category as EventCategory | null) ?? null,
    startsAt: new Date(row.starts_at as string),
    endsAt: new Date(row.ends_at as string),
    allDay: row.all_day === true,
    timeZone: (row.timezone as string | null) ?? null,
    visibility: ((row.visibility as EventVisibility | null) ?? "household"),
    recurrence: parseRecurrence(row.recurrence),
    status: row.status as CalendarEventRecord["status"],
    ownerMemberId: (row.owner_member_id as string | null) ?? null,
    protected: row.protected === true,
    location: (row.location as string | null) ?? null,
    participantMemberIds: ((row.event_participants as Row[] | null) ?? [])
      .filter((participant) => participant.response !== "no")
      .map((participant) => participant.member_id as string),
    exceptions,
  };
}

async function readOccasionMembers(supabase: SupabaseClient, householdId: string): Promise<(OccasionMember & { memberType: string })[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select("id, display_name, member_type, date_of_birth, special_occasion_date, special_occasion_label, status")
    .eq("household_id", householdId)
    .neq("status", "inactive");
  if (error) throw new Error(`calendar occasions failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    displayName: row.display_name as string,
    memberType: row.member_type as string,
    dateOfBirth: (row.date_of_birth as string | null) ?? null,
    specialOccasionDate: (row.special_occasion_date as string | null) ?? null,
    specialOccasionLabel: (row.special_occasion_label as string | null) ?? null,
  }));
}

async function readHolidays(supabase: SupabaseClient, region: string, range: { from: string; to: string }): Promise<HolidayRecord[]> {
  const country = region.slice(0, 2);
  const subdivision = region.length > 2 ? region : null;
  const base = () =>
    supabase.from("public_holidays").select("id, on_date, name, source").eq("region", country).gte("on_date", range.from).lte("on_date", range.to);
  // The whole country's, plus the chosen subdivision's: two plain filters, never an interpolated one.
  const [national, local] = await Promise.all([
    base().is("subregion", null),
    subdivision ? base().eq("subregion", subdivision) : Promise.resolve({ data: [], error: null }),
  ]);
  if (national.error) throw new Error(`calendar holidays failed: ${national.error.code ?? "unknown"}`);
  if (local.error) throw new Error(`calendar holidays failed: ${local.error.code ?? "unknown"}`);
  return [...((national.data as Row[] | null) ?? []), ...((local.data as Row[] | null) ?? [])]
    .map((row) => ({ id: row.id as string, onDate: row.on_date as string, name: row.name as string, source: row.source as string }))
    .sort((a, b) => a.onDate.localeCompare(b.onDate));
}

// --- Other modules (26-002) ---------------------------------------------------
//
// Each reads only the range, through the viewer's session, so the module's own
// RLS decides the rows: `may_see_child` for school, `may_see_finance` for
// bills, `may_see_health` for appointments.

/** The range as instants, a day either side so nothing at the edge of another time zone is lost. */
function widened(range: { from: string; to: string }, timeZone: string) {
  const { start, end } = rangeInstants(range.from, range.to, timeZone);
  return { from: new Date(start.getTime() - 86_400_000).toISOString(), to: new Date(end.getTime() + 86_400_000).toISOString() };
}

function failed(what: string, error: { code?: string } | null): never {
  throw new Error(`calendar ${what} failed: ${error?.code ?? "unknown"}`);
}

const date = (value: unknown) => (value ? new Date(value as string) : null);

async function readSchoolItems(supabase: SupabaseClient, householdId: string, range: { from: string; to: string }, timeZone: string): Promise<SchoolItemRecord[]> {
  const { from, to } = widened(range, timeZone);
  const { data, error } = await supabase
    .from("school_items")
    .select("id, child_member_id, kind, title, subject, status, due_at, due_time_known, ends_at")
    .eq("household_id", householdId)
    .in("kind", ["homework", "worksheet", "project", "exam", "event"])
    .gte("due_at", from)
    .lt("due_at", to)
    .limit(500);
  if (error) failed("school", error);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    childMemberId: row.child_member_id as string,
    kind: row.kind as string,
    title: row.title as string,
    subject: (row.subject as string | null) ?? null,
    status: row.status as string,
    dueAt: date(row.due_at),
    dueTimeKnown: row.due_time_known !== false,
    endsAt: date(row.ends_at),
  }));
}

async function readMeals(supabase: SupabaseClient, householdId: string, range: { from: string; to: string }): Promise<MealRecord[]> {
  const { data, error } = await supabase
    .from("meals")
    .select("id, name, ready_by, cook_member_id, status")
    .eq("household_id", householdId)
    .gte("on_date", range.from)
    .lte("on_date", range.to)
    .limit(500);
  if (error) failed("meals", error);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    readyBy: new Date(row.ready_by as string),
    cookMemberId: (row.cook_member_id as string | null) ?? null,
    status: row.status as string,
  }));
}

async function readBills(supabase: SupabaseClient, householdId: string, range: { from: string; to: string }): Promise<BillRecord[]> {
  const { data, error } = await supabase
    .from("obligations")
    .select("id, name, due_on, status, responsible_member_id")
    .eq("household_id", householdId)
    .gte("due_on", range.from)
    .lte("due_on", range.to)
    .limit(500);
  if (error) failed("bills", error);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    dueOn: (row.due_on as string | null) ?? null,
    status: row.status as string,
    responsibleMemberId: (row.responsible_member_id as string | null) ?? null,
  }));
}

async function readAppointments(supabase: SupabaseClient, householdId: string, range: { from: string; to: string }, timeZone: string): Promise<AppointmentRecord[]> {
  const { from, to } = widened(range, timeZone);
  const { data, error } = await supabase
    .from("health_appointments")
    .select("id, member_id, appointment_type, status, privacy_scope, starts_at, ends_at, provider, facility, family_event_id")
    .eq("household_id", householdId)
    .in("status", ["proposed", "confirmed"])
    .gte("starts_at", from)
    .lt("starts_at", to)
    .limit(500);
  if (error) failed("health", error);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    memberId: row.member_id as string,
    appointmentType: row.appointment_type as string,
    status: row.status as string,
    privacyScope: row.privacy_scope as string,
    startsAt: new Date(row.starts_at as string),
    endsAt: date(row.ends_at),
    provider: (row.provider as string | null) ?? null,
    facility: (row.facility as string | null) ?? null,
    familyEventId: (row.family_event_id as string | null) ?? null,
  }));
}

/** The children this viewer is a guardian of; none when it cannot be read, which only ever shows less. */
async function readGuardianOf(supabase: SupabaseClient, householdId: string, memberId: string): Promise<string[]> {
  const { data, error } = await supabase.from("member_guardians").select("child_member_id").eq("household_id", householdId).eq("guardian_member_id", memberId).limit(50);
  if (error) return [];
  return ((data as Row[] | null) ?? []).map((row) => row.child_member_id as string);
}

async function readHelperAbsences(supabase: SupabaseClient, householdId: string, range: { from: string; to: string }): Promise<HelperAbsenceRecord[]> {
  const { data, error } = await supabase
    .from("availability_exceptions")
    .select("member_id, on_date, available")
    .eq("household_id", householdId)
    .eq("available", false)
    .gte("on_date", range.from)
    .lte("on_date", range.to)
    .limit(500);
  if (error) failed("helpers", error);
  return ((data as Row[] | null) ?? []).map((row) => ({ memberId: row.member_id as string, onDate: row.on_date as string, available: row.available === true }));
}

async function readServiceVisits(supabase: SupabaseClient, householdId: string, range: { from: string; to: string }, timeZone: string): Promise<ServiceVisitRecord[]> {
  const { from, to } = widened(range, timeZone);
  const { data, error } = await supabase
    .from("service_requests")
    .select("id, subject, provider_name, status, scheduled_for")
    .eq("household_id", householdId)
    .gte("scheduled_for", from)
    .lt("scheduled_for", to)
    .limit(200);
  if (error) failed("upkeep", error);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    subject: row.subject as string,
    providerName: (row.provider_name as string | null) ?? null,
    status: row.status as string,
    scheduledFor: date(row.scheduled_for),
  }));
}

async function readOutcomes(
  supabase: SupabaseClient,
  householdId: string,
  range: { from: string; to: string },
  timeZone: string,
): Promise<OutcomeDueRecord[]> {
  const { from, to } = widened(range, timeZone);
  const [outcomes, playbook] = await Promise.all([
    supabase
      .from("outcomes")
      .select("id, outcome_key, status, owner_member_id, due_at")
      .eq("household_id", householdId)
      .in("status", ["pending", "on_track", "at_risk", "blocked"])
      .gte("due_at", from)
      .lt("due_at", to)
      .limit(500),
    supabase.from("playbook_items").select("outcome_key, name").eq("household_id", householdId).eq("active", true).limit(500),
  ]);
  if (outcomes.error) failed("outcomes", outcomes.error);
  // A name that cannot be read falls back to the outcome's own key.
  const names = new Map(((playbook.data as Row[] | null) ?? []).map((row) => [row.outcome_key as string, row.name as string]));
  return ((outcomes.data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    outcomeKey: row.outcome_key as string,
    name: names.get(row.outcome_key as string) ?? null,
    status: row.status as string,
    ownerMemberId: (row.owner_member_id as string | null) ?? null,
    dueAt: date(row.due_at),
  }));
}

async function readOrders(supabase: SupabaseClient, householdId: string, range: { from: string; to: string }, timeZone: string): Promise<OrderRecord[]> {
  const { from, to } = widened(range, timeZone);
  const { data, error } = await supabase
    .from("orders")
    .select("id, provider, status, expected_at")
    .eq("household_id", householdId)
    .in("status", ["placed", "confirmed", "shipped"])
    .gte("expected_at", from)
    .lt("expected_at", to)
    .limit(200);
  if (error) failed("orders", error);
  return ((data as Row[] | null) ?? []).map((row) => ({ id: row.id as string, provider: row.provider as string, status: row.status as string, expectedAt: date(row.expected_at) }));
}

/** How long this server keeps the list of holiday regions: it changes only when a new list is loaded. */
const REGIONS_KEPT_MS = 60 * 60_000;
let regionsKept: { at: number; regions: string[] } | null = null;

/**
 * The regions holidays are kept for, to offer in the filter: national first.
 *
 * Platform data, the same for every household, so it is read at most once an
 * hour per server rather than on every calendar view.
 */
export async function holidayRegions(supabase: SupabaseClient, now = Date.now()): Promise<string[]> {
  if (regionsKept && now - regionsKept.at < REGIONS_KEPT_MS) return regionsKept.regions;
  const regions = await readHolidayRegions(supabase);
  if (regions.length > 0) regionsKept = { at: now, regions };
  return regions;
}

async function readHolidayRegions(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("public_holidays").select("region, subregion").limit(2000);
  if (error) return [];
  const regions = new Set<string>();
  for (const row of (data as Row[] | null) ?? []) {
    regions.add(row.region as string);
    if (row.subregion) regions.add(row.subregion as string);
  }
  return [...regions].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

// --- Preferences -----------------------------------------------------------

export async function readCalendarPreferences(supabase: SupabaseClient, memberId: string): Promise<CalendarPreferences> {
  const { data } = await supabase.from("calendar_preferences").select("default_view, filters, holiday_region").eq("member_id", memberId).maybeSingle();
  return parsePreferences((data as Row | null) ?? null);
}

export async function saveCalendarPreferences(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; preferences: CalendarPreferences },
): Promise<void> {
  const filters: CalendarFilters = { ...DEFAULT_FILTERS, ...input.preferences.filters };
  const row = {
    member_id: input.memberId,
    household_id: input.householdId,
    default_view: input.preferences.defaultView,
    filters,
    holiday_region: input.preferences.holidayRegion,
  };
  const { error } = await supabase.from("calendar_preferences").upsert(row, { onConflict: "member_id" });
  if (error) throw error.code === "42501" ? ApiError.forbidden("You can only change your own calendar.") : new Error(`saveCalendarPreferences failed: ${error.code ?? "unknown"}`);
}

// --- One occurrence of a repeating event ------------------------------------

/** Skip one occurrence, or bring it back. Kept as an exception row, so the series itself never changes. */
async function setOccurrenceCancelledImpl(
  supabase: SupabaseClient,
  input: { householdId: string; eventId: string; occurrenceDate: string; cancelled: boolean },
): Promise<void> {
  if (!isDateKey(input.occurrenceDate)) throw ApiError.badRequest("That is not a date.");
  if (input.cancelled) {
    const { error } = await supabase
      .from("event_exceptions")
      .upsert({ household_id: input.householdId, event_id: input.eventId, occurrence_date: input.occurrenceDate, cancelled: true }, { onConflict: "event_id,occurrence_date" });
    if (error) throw error.code === "42501" ? ApiError.forbidden("Only the event's owner or an Admin can change it.") : new Error(`setOccurrenceCancelled failed: ${error.code ?? "unknown"}`);
    return;
  }
  const { error } = await supabase.from("event_exceptions").delete().eq("household_id", input.householdId).eq("event_id", input.eventId).eq("occurrence_date", input.occurrenceDate);
  if (error) throw new Error(`setOccurrenceCancelled failed: ${error.code ?? "unknown"}`);
}

export const setOccurrenceCancelled = invalidatesContext(setOccurrenceCancelledImpl, (_s, input) => input.householdId);

/** Whether one occurrence of a repeating event is skipped. */
export async function isOccurrenceCancelled(supabase: SupabaseClient, input: { householdId: string; eventId: string; occurrenceDate: string }): Promise<boolean> {
  if (!isDateKey(input.occurrenceDate)) return false;
  const { data } = await supabase
    .from("event_exceptions")
    .select("cancelled")
    .eq("household_id", input.householdId)
    .eq("event_id", input.eventId)
    .eq("occurrence_date", input.occurrenceDate)
    .maybeSingle();
  return (data as Row | null)?.cancelled === true;
}
