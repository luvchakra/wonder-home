import { describe, expect, it } from "vitest";

import { atLocal } from "@wonderhome/core/calendar/dates";
import type { CalendarEntry } from "@wonderhome/core/calendar/projection";

import { pinchIntent } from "../calendar/_components/calendar-gestures";
import { badgesOf, dateWords, entryRow, hrefOf, weekStartFor, whenOn, type EntryWords } from "./calendar-view";

const TZ = "Asia/Kolkata";
const t = ((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)) as unknown as EntryWords["t"];
const words: EntryWords = {
  t,
  time: (at) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(at),
  shortDate: (key) => key,
  nameOf: (id) => ({ a: "Asha", r: "Ravi" })[id] ?? null,
  timeZone: TZ,
};

function entry(partial: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: "event:e1",
    source: "event",
    sourceId: "e1",
    title: "Dinner",
    detail: null,
    start: atLocal("2026-10-20", 19 * 60, TZ),
    end: atLocal("2026-10-20", 21 * 60, TZ),
    allDay: false,
    timeZone: TZ,
    kind: "block",
    category: "family",
    memberIds: [],
    ownerMemberId: null,
    status: "confirmed",
    visibility: "household",
    occurrenceDate: null,
    repeats: false,
    protected: false,
    href: "/family/events/e1",
    can: { edit: true },
    ...partial,
  };
}

describe("calendar words", () => {
  it("says when on the day it is seen from", () => {
    expect(whenOn(entry({}), "2026-10-20", words)).toBe("19:00 – 21:00");
    const overnight = entry({ end: atLocal("2026-10-21", 2 * 60, TZ) });
    expect(whenOn(overnight, "2026-10-20", words)).toBe("19:00 – 2026-10-21 02:00");
    expect(whenOn(overnight, "2026-10-21", words)).toBe('calendar.entry.until:{"time":"02:00"}');
    expect(whenOn(entry({ allDay: true }), "2026-10-20", words)).toBe("calendar.entry.allDay");
  });

  it("names who is going, says proposed and private in words, and keeps the holiday's source", () => {
    const row = entryRow(entry({ memberIds: ["a", "r"], status: "proposed", visibility: "private" }), "2026-10-20", words);
    expect(row.who).toBe("Asha, Ravi");
    expect(row.proposed).toBe(true);
    expect(badgesOf(entry({ status: "proposed", visibility: "private", repeats: true }), t)).toEqual(["calendar.entry.proposed", "calendar.entry.repeats", "calendar.entry.private"]);
    const holiday = entryRow(entry({ source: "holiday", detail: "DoP&T 2026", href: null, memberIds: [] }), "2026-10-20", words);
    expect(holiday.detail).toBe('calendar.entry.holiday:{"source":"DoP&T 2026"}');
    expect(holiday.href).toBeNull();
  });

  it("opens an event on the day it was tapped, and a repeating one on its occurrence", () => {
    expect(hrefOf(entry({}), "2026-10-20")).toBe("/family/events/e1?on=2026-10-20");
    expect(hrefOf(entry({ occurrenceDate: "2026-10-27", repeats: true }), "2026-10-27")).toBe("/family/events/e1?on=2026-10-27");
    expect(hrefOf(entry({ source: "occasion", href: "/family" }), "2026-10-20")).toBe("/family");
  });

  it("starts the week on Monday, or Sunday where that is the custom", () => {
    expect(weekStartFor("IN")).toBe(1);
    expect(weekStartFor("US")).toBe(0);
    expect(weekStartFor(null)).toBe(1);
    expect(dateWords("en-GB").weekdays(1, "short")[0]).toBe("Mon");
    expect(dateWords("en-US").weekdays(0, "short")[0]).toBe("Sun");
  });

  it("never moves a calendar day by the time zone", () => {
    expect(dateWords("en-GB").dayNumber("2026-10-01")).toBe("1");
    expect(dateWords("en-GB").monthTitle(2026, 12)).toBe("December 2026");
  });
});

describe("pinch", () => {
  it("needs a clear spread or squeeze, not a wobble", () => {
    expect(pinchIntent(100, 130)).toBe("in");
    expect(pinchIntent(100, 75)).toBe("out");
    expect(pinchIntent(100, 110)).toBeNull();
    expect(pinchIntent(0, 50)).toBeNull();
  });
});
