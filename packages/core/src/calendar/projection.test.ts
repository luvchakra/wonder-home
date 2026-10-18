import { describe, expect, it } from "vitest";

import { atLocal, monthGrid, stepFocus, viewRange, zoomView } from "./dates";
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, effectiveHolidayRegion, parseFilters, parsePreferences } from "./preferences";
import {
  anniversaryIn,
  clashesWith,
  densityByDay,
  entriesByDay,
  eventEntries,
  holidayEntries,
  mergeEntries,
  occasionEntries,
  type CalendarEventRecord,
  type CalendarViewer,
} from "./projection";

const TZ = "Asia/Kolkata";
const ME = "00000000-0000-4000-8000-00000000000a";
const ASHA = "00000000-0000-4000-8000-00000000000b";
const viewer: CalendarViewer = { memberId: ME, isAdmin: false, timeZone: TZ };
const words = { birthday: (name: string) => `${name}'s birthday`, occasion: (name: string, label: string | null) => `${name}: ${label ?? "occasion"}` };

function event(partial: Partial<CalendarEventRecord>): CalendarEventRecord {
  return {
    id: "e1",
    title: "Sunday lunch",
    kind: "family_time",
    category: null,
    startsAt: atLocal("2026-10-25", 13 * 60, TZ),
    endsAt: atLocal("2026-10-25", 15 * 60, TZ),
    allDay: false,
    timeZone: null,
    visibility: "household",
    recurrence: null,
    status: "planned",
    ownerMemberId: ASHA,
    protected: false,
    location: "Home",
    participantMemberIds: [],
    exceptions: [],
    ...partial,
  };
}

const OCTOBER = { from: "2026-10-01", to: "2026-10-31" };

describe("event entries", () => {
  it("names its source, the screen that owns it, and whether this viewer may edit it", () => {
    const [entry] = eventEntries([event({})], viewer, OCTOBER);
    expect(entry).toMatchObject({ id: "event:e1", source: "event", sourceId: "e1", kind: "block", category: "family", status: "confirmed", href: "/family/events/e1", detail: "Home" });
    expect(entry!.can.edit).toBe(false);
    expect(eventEntries([event({ ownerMemberId: ME })], viewer, OCTOBER)[0]!.can.edit).toBe(true);
    expect(eventEntries([event({})], { ...viewer, isAdmin: true }, OCTOBER)[0]!.can.edit).toBe(true);
  });

  it("keeps proposed apart from confirmed and leaves out cancelled", () => {
    expect(eventEntries([event({ status: "proposed" })], viewer, OCTOBER)[0]!.status).toBe("proposed");
    expect(eventEntries([event({ status: "cancelled" })], viewer, OCTOBER)).toEqual([]);
  });

  it("gives each occurrence of a repeating event its own stable id", () => {
    const entries = eventEntries([event({ recurrence: { freq: "weekly" }, startsAt: atLocal("2026-10-04", 9 * 60, TZ), endsAt: atLocal("2026-10-04", 10 * 60, TZ) })], viewer, OCTOBER);
    expect(entries.map((entry) => entry.id)).toEqual(["event:e1:2026-10-04", "event:e1:2026-10-11", "event:e1:2026-10-18", "event:e1:2026-10-25"]);
    expect(entries.every((entry) => entry.repeats)).toBe(true);
  });

  it("takes the category it was given, else one from its kind", () => {
    expect(eventEntries([event({ kind: "school_event" })], viewer, OCTOBER)[0]!.category).toBe("school");
    expect(eventEntries([event({ kind: "outing", category: "work" })], viewer, OCTOBER)[0]!.category).toBe("work");
  });
});

describe("occasions", () => {
  it("projects birthdays from the member's date, on the household's clock, every year", () => {
    const entries = occasionEntries([{ id: ASHA, displayName: "Asha", dateOfBirth: "1990-10-12", specialOccasionDate: null, specialOccasionLabel: null }], viewer, { from: "2026-10-01", to: "2027-10-31" }, words);
    expect(entries.map((entry) => entry.occurrenceDate)).toEqual(["2026-10-12", "2027-10-12"]);
    expect(entries[0]).toMatchObject({ title: "Asha's birthday", allDay: true, kind: "marker", memberIds: [ASHA] });
    expect(entries[0]!.start).toEqual(atLocal("2026-10-12", 0, TZ));
  });

  it("puts a 29 February birthday on the 28th in other years", () => {
    expect(anniversaryIn(2027, "2016-02-29")).toBe("2027-02-28");
    expect(anniversaryIn(2028, "2016-02-29")).toBe("2028-02-29");
  });

  it("does not show a birthday before the person was born", () => {
    expect(occasionEntries([{ id: ASHA, displayName: "Baby", dateOfBirth: "2027-03-01", specialOccasionDate: null, specialOccasionLabel: null }], viewer, { from: "2026-01-01", to: "2026-12-31" }, words)).toEqual([]);
  });
});

describe("holidays", () => {
  it("are all-day, belong to nobody, and say where the date comes from", () => {
    const [entry] = holidayEntries([{ id: "h1", onDate: "2026-11-08", name: "Diwali", source: "Government of India, DoP&T holiday list 2026" }], viewer);
    expect(entry).toMatchObject({ category: "holiday", allDay: true, memberIds: [], detail: "Government of India, DoP&T holiday list 2026", can: { edit: false } });
  });
});

describe("putting entries together", () => {
  it("drops duplicates by identity and sorts all-day first", () => {
    const lunch = eventEntries([event({})], viewer, OCTOBER);
    const holiday = holidayEntries([{ id: "h1", onDate: "2026-10-25", name: "Something", source: "x" }], viewer);
    const merged = mergeEntries(lunch, holiday, lunch);
    expect(merged.map((entry) => entry.id)).toEqual(["holiday:h1", "event:e1"]);
  });

  it("places a multi-day entry on every day it covers, and counts days without titles", () => {
    const trip = eventEntries([event({ id: "trip", allDay: true, startsAt: atLocal("2026-10-09", 0, TZ), endsAt: atLocal("2026-10-12", 0, TZ) })], viewer, OCTOBER);
    expect([...entriesByDay(trip, TZ).keys()]).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);
    const density = densityByDay(trip, TZ);
    expect(density["2026-10-10"]).toEqual({ total: 1, categories: { family: 1 } });
    expect(JSON.stringify(density)).not.toContain("Sunday lunch");
  });
});

describe("conflicts", () => {
  const lunch = eventEntries([event({ participantMemberIds: [ASHA] })], viewer, OCTOBER);

  it("names a timed clash that shares somebody", () => {
    const candidate = { start: atLocal("2026-10-25", 14 * 60, TZ), end: atLocal("2026-10-25", 16 * 60, TZ), memberIds: [ASHA], allDay: false };
    expect(clashesWith(lunch, candidate).map((entry) => entry.title)).toEqual(["Sunday lunch"]);
  });

  it("ignores a different person, a different time, an all-day plan and the event being moved", () => {
    expect(clashesWith(lunch, { start: atLocal("2026-10-25", 14 * 60, TZ), end: atLocal("2026-10-25", 16 * 60, TZ), memberIds: [ME], allDay: false })).toEqual([]);
    expect(clashesWith(lunch, { start: atLocal("2026-10-25", 15 * 60, TZ), end: atLocal("2026-10-25", 16 * 60, TZ), memberIds: [ASHA], allDay: false })).toEqual([]);
    expect(clashesWith(lunch, { start: atLocal("2026-10-25", 0, TZ), end: atLocal("2026-10-26", 0, TZ), memberIds: [ASHA], allDay: true })).toEqual([]);
    expect(clashesWith(lunch, { start: atLocal("2026-10-25", 14 * 60, TZ), end: atLocal("2026-10-25", 16 * 60, TZ), memberIds: [ASHA], allDay: false, ignoreSourceId: "e1" })).toEqual([]);
  });
});

describe("filters and preferences", () => {
  const entries = mergeEntries(
    eventEntries([event({ id: "mine", ownerMemberId: ME, status: "proposed" }), event({ id: "hers", participantMemberIds: [ASHA] })], viewer, OCTOBER),
    holidayEntries([{ id: "h1", onDate: "2026-10-20", name: "Dussehra", source: "x" }], viewer),
  );

  it("narrows by person, by mine and by confirmed, and leaves holidays alone", () => {
    expect(applyFilters(entries, { ...DEFAULT_FILTERS, onlyMine: true }, ME).map((e) => e.sourceId)).toEqual(["h1", "mine"]);
    expect(applyFilters(entries, { ...DEFAULT_FILTERS, confirmedOnly: true }, ME).map((e) => e.sourceId)).toEqual(["h1", "hers"]);
    expect(applyFilters(entries, { ...DEFAULT_FILTERS, hiddenCategories: ["holiday"] }, ME).map((e) => e.sourceId)).toEqual(["mine", "hers"]);
  });

  it("starts with meals and responsibilities hidden (D6) and reads junk as the default", () => {
    expect(DEFAULT_FILTERS.hiddenSources).toEqual(["meal", "outcome"]);
    expect(parseFilters({ hiddenSources: ["meal", "nonsense"], memberIds: ["not-a-uuid", ME], onlyMine: "yes" })).toEqual({ ...DEFAULT_FILTERS, hiddenSources: ["meal"], memberIds: [ME], onlyMine: false });
    expect(parsePreferences({ default_view: "decade", filters: null, holiday_region: "india" })).toMatchObject({ defaultView: "month", holidayRegion: null });
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, onlyMine: true, hiddenSources: [] })).toBe(2);
  });

  it("follows the household's region unless a person picks one or turns holidays off", () => {
    expect(effectiveHolidayRegion(null, "IN")).toBe("IN");
    expect(effectiveHolidayRegion("IN-DL", "IN")).toBe("IN-DL");
    expect(effectiveHolidayRegion("off", "IN")).toBeNull();
    expect(effectiveHolidayRegion(null, null)).toBeNull();
  });
});

describe("views", () => {
  it("draws whole weeks around a month and keeps the focused day when stepping", () => {
    const grid = monthGrid(2026, 10, 1);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-09-28");
    expect(viewRange("week", "2026-10-18", 1)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(stepFocus("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(stepFocus("year", "2028-02-29", 1)).toBe("2029-02-28");
  });

  it("zooms one level at a time and stops at the ends", () => {
    expect(zoomView("month", "in")).toBe("week");
    expect(zoomView("day", "in")).toBe("day");
    expect(zoomView("month", "out")).toBe("year");
    expect(zoomView("year", "out")).toBe("year");
  });
});
