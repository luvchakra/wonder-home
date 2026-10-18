import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import { rangeInstants, isDateKey } from "./dates";
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
};

export type CalendarRangeInput = {
  householdId: string;
  householdRegion: string | null;
  viewer: CalendarViewer;
  from: string;
  to: string;
  holidayRegion: string | null;
  words: OccasionWords;
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
  const [events, members, holidays] = await Promise.all([
    settle("event", () => readEvents(supabase, input.householdId, range, input.viewer.timeZone)),
    settle("occasion", () => readOccasionMembers(supabase, input.householdId)),
    region ? settle("holiday", () => readHolidays(supabase, region, range)) : Promise.resolve([] as HolidayRecord[]),
  ]);

  return {
    entries: mergeEntries(
      eventEntries(events, input.viewer, range),
      occasionEntries(members, input.viewer, range, input.words),
      holidayEntries(holidays, input.viewer),
    ),
    failedSources,
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

async function readOccasionMembers(supabase: SupabaseClient, householdId: string): Promise<OccasionMember[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select("id, display_name, date_of_birth, special_occasion_date, special_occasion_label, status")
    .eq("household_id", householdId)
    .neq("status", "inactive");
  if (error) throw new Error(`calendar occasions failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    displayName: row.display_name as string,
    dateOfBirth: (row.date_of_birth as string | null) ?? null,
    specialOccasionDate: (row.special_occasion_date as string | null) ?? null,
    specialOccasionLabel: (row.special_occasion_label as string | null) ?? null,
  }));
}

async function readHolidays(supabase: SupabaseClient, region: string, range: { from: string; to: string }): Promise<HolidayRecord[]> {
  const [country, subdivision] = [region.slice(0, 2), region.length > 2 ? region : null];
  let query = supabase
    .from("public_holidays")
    .select("id, on_date, name, source")
    .eq("region", country)
    .gte("on_date", range.from)
    .lte("on_date", range.to)
    .order("on_date", { ascending: true });
  query = subdivision ? query.or(`subregion.is.null,subregion.eq.${subdivision}`) : query.is("subregion", null);
  const { data, error } = await query;
  if (error) throw new Error(`calendar holidays failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    onDate: row.on_date as string,
    name: row.name as string,
    source: row.source as string,
  }));
}

/** The regions holidays are kept for, to offer in the filter: national first. */
export async function holidayRegions(supabase: SupabaseClient): Promise<string[]> {
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
