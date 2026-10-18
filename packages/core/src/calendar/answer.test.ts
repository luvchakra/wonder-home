import { describe, expect, it } from "vitest";

import { resolveCalendarSpan } from "../conversation/temporal";
import { asksTheCalendar, calendarSpanReply, MAX_LISTED } from "./answer";
import { atLocal } from "./dates";
import { eventEntries, holidayEntries, mergeEntries, occasionEntries, type CalendarViewer } from "./projection";

const TZ = "Asia/Kolkata";
const viewer: CalendarViewer = { memberId: "m1", isAdmin: false, timeZone: TZ };
const december = resolveCalendarSpan("December", { timezone: TZ, now: new Date("2026-10-18T04:30:00Z") })!;
const range = { from: december.from, to: december.to };

describe("calendarSpanReply", () => {
  it("lists what is on the calendar for the span, by date, with the record's own titles", () => {
    const entries = mergeEntries(
      eventEntries(
        [
          {
            id: "e1", title: "Asmi's Birthday party", kind: "birthday", category: null, startsAt: atLocal("2026-12-08", 18 * 60 + 30, TZ), endsAt: atLocal("2026-12-08", 21 * 60, TZ),
            allDay: false, timeZone: null, visibility: "household", recurrence: null, status: "proposed", ownerMemberId: "m1", protected: false, location: null, participantMemberIds: [], exceptions: [],
          },
        ],
        viewer,
        range,
      ),
      occasionEntries([{ id: "m2", displayName: "Manan", dateOfBirth: "2019-12-16", specialOccasionDate: null, specialOccasionLabel: null }], viewer, range, {
        birthday: (name) => `${name}'s birthday`,
        occasion: (name) => name,
      }),
      holidayEntries([{ id: "h1", onDate: "2026-12-25", name: "Christmas Day", source: "DoP&T" }], viewer),
    );
    const text = calendarSpanReply({ span: december, entries, failedSources: [], timeZone: TZ });
    expect(text).toBe(
      "Here's what's on the calendar for December 2026:\n\n- Tue 8 Dec, 6:30 pm — Asmi's Birthday party (proposed)\n- Wed 16 Dec — Manan's birthday\n- Fri 25 Dec — Christmas Day (public holiday)",
    );
  });

  it("says plainly when nothing is on, and when part of the calendar could not be read", () => {
    expect(calendarSpanReply({ span: december, entries: [], failedSources: [], timeZone: TZ })).toBe("Nothing is on the calendar for December 2026.");
    expect(calendarSpanReply({ span: december, entries: [], failedSources: ["event"], timeZone: TZ })).toContain("could not be read just now");
  });

  it("lists at most a dozen and points to the Calendar for the rest", () => {
    const many = holidayEntries(
      Array.from({ length: MAX_LISTED + 3 }, (_, index) => ({ id: `h${index}`, onDate: `2026-12-${String(index + 1).padStart(2, "0")}`, name: `Day ${index + 1}`, source: "x" })),
      viewer,
    );
    const text = calendarSpanReply({ span: december, entries: many, failedSources: [], timeZone: TZ });
    expect(text.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(MAX_LISTED);
    expect(text).toContain("…and 3 more. The Calendar has them all.");
  });
});

describe("asksTheCalendar", () => {
  it("is the calendar's question only when no other part of the home is named", () => {
    expect(asksTheCalendar("Do you see any events scheduled in December?")).toBe(true);
    expect(asksTheCalendar("What's coming up in the next few months?")).toBe(true);
    expect(asksTheCalendar("Which bills are due this month?")).toBe(false);
    expect(asksTheCalendar("Any homework due next month?")).toBe(false);
    expect(asksTheCalendar("Any doctor appointments in December?")).toBe(false);
  });

  it("writes September as Sep, like every other date", () => {
    const september = resolveCalendarSpan("this month", { timezone: TZ, now: new Date("2026-09-23T04:30:00Z") })!;
    const entries = holidayEntries([{ id: "h", onDate: "2026-09-24", name: "A day", source: "x" }], viewer);
    expect(calendarSpanReply({ span: september, entries, failedSources: [], timeZone: TZ })).toContain("- Thu 24 Sep — A day");
  });
});

