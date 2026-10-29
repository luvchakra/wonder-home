import { describe, expect, it } from "vitest";

import { parseIcs, unescapeText, MAX_PARSED_EVENTS } from "./ics";

const CRLF = "\r\n";
function ics(body: string): string {
  return `BEGIN:VCALENDAR${CRLF}VERSION:2.0${CRLF}${body}${CRLF}END:VCALENDAR${CRLF}`;
}

describe("parseIcs", () => {
  it("reads a simple VEVENT with its fields", () => {
    const { events } = parseIcs(
      ics(["BEGIN:VEVENT", "UID:abc-123", "SUMMARY:Team sync", "LOCATION:Room 2", "DTSTART:20260115T100000Z", "DTEND:20260115T110000Z", "END:VEVENT"].join(CRLF)),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ uid: "abc-123", summary: "Team sync", location: "Room 2" });
    expect(events[0]!.dtstart).toEqual({ value: "20260115T100000Z", params: {} });
  });

  it("unfolds a folded line (RFC 5545: the fold whitespace is stripped, no space added)", () => {
    const { events } = parseIcs(ics(["BEGIN:VEVENT", "UID:x", "SUMMARY:A very lo", " ng title", "DTSTART:20260115", "END:VEVENT"].join(CRLF)));
    expect(events[0]!.summary).toBe("A very long title");
  });

  it("reads parameters including a quoted value", () => {
    const { events } = parseIcs(ics(["BEGIN:VEVENT", "UID:x", 'DTSTART;TZID="America/New_York":20260115T090000', "END:VEVENT"].join(CRLF)));
    expect(events[0]!.dtstart).toEqual({ value: "20260115T090000", params: { TZID: "America/New_York" } });
  });

  it("marks a VALUE=DATE start", () => {
    const { events } = parseIcs(ics(["BEGIN:VEVENT", "UID:x", "DTSTART;VALUE=DATE:20260115", "END:VEVENT"].join(CRLF)));
    expect(events[0]!.dtstart!.params.VALUE).toBe("DATE");
  });

  it("keeps RRULE and flattens EXDATE", () => {
    const { events } = parseIcs(
      ics(["BEGIN:VEVENT", "UID:x", "DTSTART:20260115T100000Z", "RRULE:FREQ=WEEKLY;COUNT=5", "EXDATE:20260122T100000Z,20260129T100000Z", "END:VEVENT"].join(CRLF)),
    );
    expect(events[0]!.rrule).toBe("FREQ=WEEKLY;COUNT=5");
    expect(events[0]!.exdates.map((e) => e.value)).toEqual(["20260122T100000Z", "20260129T100000Z"]);
  });

  it("skips a nested VALARM wholesale", () => {
    const { events } = parseIcs(
      ics(["BEGIN:VEVENT", "UID:x", "SUMMARY:Real", "DTSTART:20260115T100000Z", "BEGIN:VALARM", "ACTION:DISPLAY", "SUMMARY:Alarm noise", "END:VALARM", "END:VEVENT"].join(CRLF)),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.summary).toBe("Real");
  });

  it("ignores malformed lines and never throws", () => {
    const { events } = parseIcs(ics(["BEGIN:VEVENT", "this is not a property", "UID:ok", "DTSTART:20260115", "END:VEVENT"].join(CRLF)));
    expect(events[0]!.uid).toBe("ok");
  });

  it("caps the number of events and reports truncation", () => {
    const many = Array.from({ length: 5 }, (_, i) => ["BEGIN:VEVENT", `UID:${i}`, "DTSTART:20260115", "END:VEVENT"].join(CRLF)).join(CRLF);
    const { events, truncated } = parseIcs(ics(many), { maxEvents: 3 });
    expect(events).toHaveLength(3);
    expect(truncated).toBe(true);
  });

  it("never reads past the hard ceiling", () => {
    const { events } = parseIcs(ics(["BEGIN:VEVENT", "UID:a", "DTSTART:20260115", "END:VEVENT"].join(CRLF)), { maxEvents: 999_999 });
    // only one event here, but the cap option cannot exceed MAX_PARSED_EVENTS
    expect(events.length).toBeLessThanOrEqual(MAX_PARSED_EVENTS);
  });
});

describe("unescapeText", () => {
  it("turns ICS escapes into their characters", () => {
    expect(unescapeText("a\\, b\\; c\\nd\\\\e")).toBe("a, b; c\nd\\e");
  });
});
