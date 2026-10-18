/**
 * How one person likes to see the calendar (story 12-009, design §4 "Filters").
 *
 * Stored per member in `calendar_preferences` (only that member reads or
 * writes it). Filters only ever narrow what this viewer is already allowed to
 * see; they are never a privacy control — RLS and the adapters are.
 *
 * Meals and responsibilities start hidden (D6) so they do not flood the month.
 */
import { CALENDAR_CATEGORIES, CALENDAR_SOURCES, type CalendarCategory, type CalendarEntry, type CalendarSource } from "./projection";
import { CALENDAR_VIEWS, type CalendarView } from "./dates";

export type CalendarFilters = {
  hiddenSources: CalendarSource[];
  hiddenCategories: CalendarCategory[];
  /** Empty: everybody. */
  memberIds: string[];
  onlyMine: boolean;
  confirmedOnly: boolean;
};

export type CalendarPreferences = {
  defaultView: CalendarView;
  filters: CalendarFilters;
  /** 'IN', 'IN-DL'; null follows the household's region; 'off' hides holidays. */
  holidayRegion: string | null;
};

export const DEFAULT_FILTERS: CalendarFilters = {
  hiddenSources: ["meal", "outcome"],
  hiddenCategories: [],
  memberIds: [],
  onlyMine: false,
  confirmedOnly: false,
};

export const DEFAULT_PREFERENCES: CalendarPreferences = { defaultView: "month", filters: DEFAULT_FILTERS, holidayRegion: null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HOLIDAY_REGION = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

function pick<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is T => allowed.includes(item as T)))];
}

/** Whatever is stored, read as filters; anything unknown falls back to the default. */
export function parseFilters(value: unknown): CalendarFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_FILTERS };
  const raw = value as Record<string, unknown>;
  return {
    hiddenSources: Array.isArray(raw.hiddenSources) ? pick(raw.hiddenSources, CALENDAR_SOURCES) : [...DEFAULT_FILTERS.hiddenSources],
    hiddenCategories: pick(raw.hiddenCategories, CALENDAR_CATEGORIES),
    memberIds: Array.isArray(raw.memberIds) ? [...new Set(raw.memberIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))].slice(0, 30) : [],
    onlyMine: raw.onlyMine === true,
    confirmedOnly: raw.confirmedOnly === true,
  };
}

export function parsePreferences(row: { default_view?: unknown; filters?: unknown; holiday_region?: unknown } | null): CalendarPreferences {
  if (!row) return { ...DEFAULT_PREFERENCES, filters: { ...DEFAULT_FILTERS } };
  const view = CALENDAR_VIEWS.includes(row.default_view as CalendarView) ? (row.default_view as CalendarView) : "month";
  const region = typeof row.holiday_region === "string" && (row.holiday_region === "off" || HOLIDAY_REGION.test(row.holiday_region)) ? row.holiday_region : null;
  return { defaultView: view, filters: parseFilters(row.filters), holidayRegion: region };
}

/** The region whose holidays this person sees, or null for none. */
export function effectiveHolidayRegion(preference: string | null, householdRegion: string | null): string | null {
  if (preference === "off") return null;
  return preference ?? householdRegion ?? null;
}

export function applyFilters(entries: readonly CalendarEntry[], filters: CalendarFilters, viewerMemberId: string): CalendarEntry[] {
  return entries.filter((entry) => {
    if (filters.hiddenSources.includes(entry.source)) return false;
    if (filters.hiddenCategories.includes(entry.category)) return false;
    if (filters.confirmedOnly && entry.status !== "confirmed") return false;
    // Holidays belong to nobody, so person filters leave them alone.
    if (entry.source === "holiday") return true;
    const involves = (memberId: string) => entry.memberIds.includes(memberId) || entry.ownerMemberId === memberId;
    if (filters.onlyMine && !involves(viewerMemberId)) return false;
    if (filters.memberIds.length > 0 && entry.memberIds.length > 0 && !filters.memberIds.some(involves)) return false;
    return true;
  });
}

/** How many filters are narrowing the view, for the "Filters · 2" label. */
export function activeFilterCount(filters: CalendarFilters): number {
  const defaults = new Set(DEFAULT_FILTERS.hiddenSources);
  const changedSources = filters.hiddenSources.length !== defaults.size || filters.hiddenSources.some((source) => !defaults.has(source));
  return (
    (changedSources ? 1 : 0) +
    (filters.hiddenCategories.length > 0 ? 1 : 0) +
    (filters.memberIds.length > 0 ? 1 : 0) +
    (filters.onlyMine ? 1 : 0) +
    (filters.confirmedOnly ? 1 : 0)
  );
}
