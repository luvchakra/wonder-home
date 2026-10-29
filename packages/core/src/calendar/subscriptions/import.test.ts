import { describe, expect, it } from "vitest";

import { parseIcs } from "./ics";
import { mapFeedToEvents, MAX_IMPORT_EVENTS } from "./import";

const CRLF = "\r\n";
const NOW = new Date("2026-01-10T00:00:00Z");
function feed(...events: string[]): string {
  return `BEGIN:VCALENDAR${CRLF}VERSION:2.0${CRLF}${events.join(CRLF)}${CRLF}END:VCALENDAR${CRLF}`;
}
function vevent(lines: string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join(CRLF);
}
function map(text: string) {
  return mapFeedToEvents(parseIcs(text), { householdTimeZone: "UTC", now: NOW });
}

describe("mapFeedToEvents", () => {
  it("imports a single timed event", () => {
    const { events } = map(feed(vevent(["UID:a", "SUMMARY:Lunch", "LOCATION:Cafe", "DESCRIPTION:Bring cash", "DTSTART:20260115T120000Z", "DTEND:20260115T130000Z"])));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ externalId: "a", title: "Lunch", location: "Cafe", notes: "Bring cash", allDay: false, timeZone: "UTC" });
    expect(events[0]!.startsAt.toISOString()).toBe("2026-01-15T12:00:00.000Z");
    expect(events[0]!.endsAt.toISOString()).toBe("2026-01-15T13:00:00.000Z");
  });

  it("treats an all-day DTEND as exclusive", () => {
    const { events } = map(feed(vevent(["UID:a", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20260115", "DTEND;VALUE=DATE:20260116"])));
    expect(events[0]!.allDay).toBe(true);
    expect(events[0]!.endsAt.getTime() - events[0]!.startsAt.getTime()).toBe(86_400_000);
  });

  it("defaults a timed event with no end to one hour", () => {
    const { events } = map(feed(vevent(["UID:a", "DTSTART:20260115T120000Z"])));
    expect(events[0]!.endsAt.getTime() - events[0]!.startsAt.getTime()).toBe(3_600_000);
  });

  it("skips a CANCELLED event", () => {
    const { events, stats } = map(feed(vevent(["UID:a", "DTSTART:20260115T120000Z", "STATUS:CANCELLED"])));
    expect(events).toHaveLength(0);
    expect(stats.skipped).toBe(1);
  });

  it("skips an event outside the window", () => {
    const { events } = map(feed(vevent(["UID:a", "DTSTART:20200101T120000Z"])));
    expect(events).toHaveLength(0);
  });

  it("sanitises and caps text", () => {
    const longTitle = "x".repeat(300);
    const { events } = map(feed(vevent(["UID:a", `SUMMARY:line\u0007one${CRLF} ${longTitle}`, "DTSTART:20260115T120000Z"])));
    expect(events[0]!.title).not.toContain("\u0007");
    expect(events[0]!.title.length).toBe(200);
  });

  it("gives an untitled event a fallback title", () => {
    const { events } = map(feed(vevent(["UID:a", "DTSTART:20260115T120000Z"])));
    expect(events[0]!.title).toBe("(Untitled event)");
  });

  it("expands a recurring event into one row per occurrence", () => {
    const { events } = map(feed(vevent(["UID:series", "SUMMARY:Standup", "DTSTART:20260112T090000Z", "RRULE:FREQ=WEEKLY;COUNT=3"])));
    expect(events.map((e) => e.externalId)).toEqual(["series@2026-01-12", "series@2026-01-19", "series@2026-01-26"]);
    expect(new Set(events.map((e) => e.title))).toEqual(new Set(["Standup"]));
  });

  it("lets a RECURRENCE-ID override replace one occurrence", () => {
    const { events } = map(
      feed(
        vevent(["UID:series", "SUMMARY:Standup", "DTSTART:20260112T090000Z", "RRULE:FREQ=WEEKLY;COUNT=3"]),
        vevent(["UID:series", "SUMMARY:Standup (moved)", "RECURRENCE-ID:20260119T090000Z", "DTSTART:20260119T140000Z", "DTEND:20260119T150000Z"]),
      ),
    );
    const moved = events.find((e) => e.externalId === "series@2026-01-19");
    expect(moved!.title).toBe("Standup (moved)");
    expect(moved!.startsAt.toISOString()).toBe("2026-01-19T14:00:00.000Z");
  });

  it("imports only the first instance of a rule it does not expand", () => {
    const { events } = map(feed(vevent(["UID:a", "SUMMARY:Odd", "DTSTART:20260115T120000Z", "RRULE:FREQ=HOURLY;COUNT=5"])));
    expect(events).toHaveLength(1);
    expect(events[0]!.externalId).toBe("a");
  });

  it("caps the total import", () => {
    const many = Array.from({ length: 5 }, (_, i) => vevent([`UID:u${i}`, "DTSTART:20260115T120000Z"]));
    const { events, stats } = mapFeedToEvents(parseIcs(feed(...many)), { householdTimeZone: "UTC", now: NOW, maxEvents: 2 });
    expect(events).toHaveLength(2);
    expect(stats.truncated).toBe(true);
    expect(MAX_IMPORT_EVENTS).toBeGreaterThan(2);
  });
});
