/**
 * The Family Calendar is a projection (story 12-009, design §2–§3.1).
 *
 * It never copies a record. Each entry names the record it came from and the
 * screen that owns it; editing happens there. Adapters here are pure: the
 * repository reads through the member's own session, so RLS has already
 * decided what this viewer may see, and these functions only shape it.
 *
 * Two distinctions stay visible on every entry: a due date (a marker) versus a
 * scheduled time (a block), and proposed versus confirmed.
 */
import { atLocal, daysBetween, localMoment, partsOf, shiftDate, dateKeyOf, isRealDate } from "./dates";
import { expandSeries, type OccurrenceException, type RecurrenceRule } from "./recurrence";

export const CALENDAR_SOURCES = ["event", "occasion", "holiday", "school", "meal", "bill", "health", "helper", "upkeep", "outcome", "order"] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

export const CALENDAR_CATEGORIES = ["family", "school", "meals", "health", "personal", "work", "household", "holiday"] as const;
export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

/** The categories a person can give their own event (holiday is the calendar's). */
export const EVENT_CATEGORIES = ["family", "school", "meals", "health", "personal", "work", "household"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_VISIBILITIES = ["household", "participants", "private"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export type CalendarEntry = {
  /** Stable: `${source}:${sourceId}`, plus `:${date}` for one occurrence of a repeating record. */
  id: string;
  source: CalendarSource;
  sourceId: string;
  /** Already reduced to what this viewer may see. */
  title: string;
  /** A short second line: a place, a holiday's source. */
  detail: string | null;
  start: Date;
  /** Null for a due marker. */
  end: Date | null;
  allDay: boolean;
  timeZone: string;
  kind: "block" | "due" | "marker";
  category: CalendarCategory;
  /** Who it is about or who is going. Empty means the whole household. */
  memberIds: string[];
  ownerMemberId: string | null;
  status: "proposed" | "confirmed";
  visibility: EventVisibility;
  /** The local date of a repeating record's occurrence. */
  occurrenceDate: string | null;
  repeats: boolean;
  protected: boolean;
  href: string | null;
  can: { edit: boolean };
};

export type CalendarViewer = {
  memberId: string;
  isAdmin: boolean;
  timeZone: string;
};

// --- Family events ---------------------------------------------------------

export type CalendarEventRecord = {
  id: string;
  title: string;
  kind: string;
  category: EventCategory | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timeZone: string | null;
  visibility: EventVisibility;
  recurrence: RecurrenceRule | null;
  status: "proposed" | "planned" | "confirmed" | "happened" | "cancelled";
  ownerMemberId: string | null;
  protected: boolean;
  location: string | null;
  participantMemberIds: string[];
  exceptions: OccurrenceException[];
};

const KIND_CATEGORY: Record<string, EventCategory> = {
  family_time: "family",
  outing: "family",
  gathering: "family",
  travel: "family",
  birthday: "family",
  special_occasion: "family",
  school_event: "school",
  appointment: "personal",
};

export function categoryForEvent(event: Pick<CalendarEventRecord, "category" | "kind">): EventCategory {
  return event.category ?? KIND_CATEGORY[event.kind] ?? "family";
}

export function mayEditEvent(event: Pick<CalendarEventRecord, "ownerMemberId">, viewer: CalendarViewer): boolean {
  return event.ownerMemberId === null || event.ownerMemberId === viewer.memberId || viewer.isAdmin;
}

export function eventEntries(
  events: readonly CalendarEventRecord[],
  viewer: CalendarViewer,
  range: { from: string; to: string },
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const event of events) {
    if (event.status === "cancelled") continue;
    const timeZone = event.timeZone ?? viewer.timeZone;
    const occurrences = expandSeries(
      { start: event.startsAt, end: event.endsAt, allDay: event.allDay, timeZone, rule: event.recurrence },
      range,
      event.exceptions,
    );
    for (const occurrence of occurrences) {
      const repeats = event.recurrence !== null;
      entries.push({
        id: repeats ? `event:${event.id}:${occurrence.occurrenceDate}` : `event:${event.id}`,
        source: "event",
        sourceId: event.id,
        title: occurrence.exception?.title ?? event.title,
        detail: occurrence.exception?.location ?? event.location,
        start: occurrence.start,
        end: occurrence.end,
        allDay: event.allDay,
        timeZone,
        kind: "block",
        category: categoryForEvent(event),
        memberIds: [...event.participantMemberIds],
        ownerMemberId: event.ownerMemberId,
        status: event.status === "proposed" ? "proposed" : "confirmed",
        visibility: event.visibility,
        occurrenceDate: repeats ? occurrence.occurrenceDate : null,
        repeats,
        protected: event.protected,
        href: `/family/events/${event.id}`,
        can: { edit: mayEditEvent(event, viewer) },
      });
    }
  }
  return entries;
}

// --- Birthdays and occasions ----------------------------------------------

export type OccasionMember = {
  id: string;
  displayName: string;
  dateOfBirth: string | null;
  specialOccasionDate: string | null;
  specialOccasionLabel: string | null;
};

export type OccasionWords = {
  birthday: (name: string) => string;
  occasion: (name: string, label: string | null) => string;
};

/** The date an anniversary lands on in `year`: 29 February falls on the 28th in other years. */
export function anniversaryIn(year: number, original: string): string {
  const { month, day } = partsOf(original);
  return isRealDate(year, month, day) ? dateKeyOf(year, month, day) : dateKeyOf(year, month, day - 1);
}

/**
 * Birthdays and occasions, projected from the member's own dates on the
 * household's clock. Replaces reading the rows the old sync trigger wrote,
 * which were set at the database's midnight and only rolled forward when the
 * member changed.
 */
export function occasionEntries(
  members: readonly OccasionMember[],
  viewer: CalendarViewer,
  range: { from: string; to: string },
  words: OccasionWords,
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  const firstYear = partsOf(range.from).year;
  const lastYear = partsOf(range.to).year;
  for (const member of members) {
    const dates: { kind: "birthday" | "occasion"; date: string }[] = [];
    if (member.dateOfBirth) dates.push({ kind: "birthday", date: member.dateOfBirth });
    if (member.specialOccasionDate) dates.push({ kind: "occasion", date: member.specialOccasionDate });
    for (const { kind, date } of dates) {
      for (let year = firstYear; year <= lastYear; year += 1) {
        if (year < partsOf(date).year) continue;
        const on = anniversaryIn(year, date);
        if (on < range.from || on > range.to) continue;
        entries.push({
          id: `occasion:${kind}:${member.id}:${on}`,
          source: "occasion",
          sourceId: member.id,
          title: kind === "birthday" ? words.birthday(member.displayName) : words.occasion(member.displayName, member.specialOccasionLabel),
          detail: null,
          start: atLocal(on, 0, viewer.timeZone),
          end: atLocal(shiftDate(on, 1), 0, viewer.timeZone),
          allDay: true,
          timeZone: viewer.timeZone,
          kind: "marker",
          category: "family",
          memberIds: [member.id],
          ownerMemberId: null,
          status: "confirmed",
          visibility: "household",
          occurrenceDate: on,
          repeats: true,
          protected: false,
          href: "/family",
          can: { edit: false },
        });
      }
    }
  }
  return entries;
}

// --- Public holidays ------------------------------------------------------

export type HolidayRecord = { id: string; onDate: string; name: string; source: string };

export function holidayEntries(holidays: readonly HolidayRecord[], viewer: CalendarViewer): CalendarEntry[] {
  return holidays.map((holiday) => ({
    id: `holiday:${holiday.id}`,
    source: "holiday",
    sourceId: holiday.id,
    title: holiday.name,
    detail: holiday.source,
    start: atLocal(holiday.onDate, 0, viewer.timeZone),
    end: atLocal(shiftDate(holiday.onDate, 1), 0, viewer.timeZone),
    allDay: true,
    timeZone: viewer.timeZone,
    kind: "marker",
    category: "holiday",
    memberIds: [],
    ownerMemberId: null,
    status: "confirmed",
    visibility: "household",
    occurrenceDate: holiday.onDate,
    repeats: false,
    protected: false,
    href: null,
    can: { edit: false },
  }));
}

// --- Putting entries together ---------------------------------------------

/** One entry per identity, all-day first, then by start, then by title. */
export function mergeEntries(...groups: readonly (readonly CalendarEntry[])[]): CalendarEntry[] {
  const byId = new Map<string, CalendarEntry>();
  for (const group of groups) for (const entry of group) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return [...byId.values()].sort(compareEntries);
}

export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const byStart = a.start.getTime() - b.start.getTime();
  if (byStart !== 0) return byStart;
  return a.title.localeCompare(b.title);
}

/** The local days an entry covers, from its start to the moment before it ends. */
export function daysOf(entry: CalendarEntry, timeZone: string): string[] {
  const first = localMoment(entry.start, timeZone).dateKey;
  if (!entry.end) return [first];
  const last = localMoment(new Date(Math.max(entry.start.getTime(), entry.end.getTime() - 1)), timeZone).dateKey;
  const span = Math.max(0, Math.min(daysBetween(first, last), 62));
  return Array.from({ length: span + 1 }, (_, index) => shiftDate(first, index));
}

export function entriesByDay(entries: readonly CalendarEntry[], timeZone: string): Map<string, CalendarEntry[]> {
  const days = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    for (const day of daysOf(entry, timeZone)) {
      const list = days.get(day) ?? [];
      list.push(entry);
      days.set(day, list);
    }
  }
  for (const list of days.values()) list.sort(compareEntries);
  return days;
}

export type DayDensity = { total: number; categories: Partial<Record<CalendarCategory, number>> };

/** Per-day counts by category: what the Year view draws, and never a title. */
export function densityByDay(entries: readonly CalendarEntry[], timeZone: string): Record<string, DayDensity> {
  const out: Record<string, DayDensity> = {};
  for (const [day, list] of entriesByDay(entries, timeZone)) {
    const density: DayDensity = { total: list.length, categories: {} };
    for (const entry of list) density.categories[entry.category] = (density.categories[entry.category] ?? 0) + 1;
    out[day] = density;
  }
  return out;
}

// --- Conflicts --------------------------------------------------------------

export type CandidateEvent = { start: Date; end: Date; memberIds: readonly string[]; allDay: boolean; ignoreSourceId?: string };

/**
 * The visible entries a new or moved event would clash with: timed blocks that
 * overlap it and share somebody (an entry with no one named is everyone's).
 * All-day markers and holidays are context, not clashes.
 */
export function clashesWith(entries: readonly CalendarEntry[], candidate: CandidateEvent): CalendarEntry[] {
  if (candidate.allDay) return [];
  return entries.filter((entry) => {
    if (entry.kind !== "block" || entry.allDay || !entry.end) return false;
    if (candidate.ignoreSourceId && entry.sourceId === candidate.ignoreSourceId) return false;
    if (entry.start >= candidate.end || entry.end <= candidate.start) return false;
    if (entry.memberIds.length === 0 || candidate.memberIds.length === 0) return true;
    return entry.memberIds.some((id) => candidate.memberIds.includes(id));
  });
}
