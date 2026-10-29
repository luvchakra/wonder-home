import { describe, expect, it } from "vitest";

import { dateKeyInZone, isValidTimeZone, parseIcsDateTime, zonedWallTimeToUtc } from "./time";

const prop = (value: string, params: Record<string, string> = {}) => ({ value, params });

describe("parseIcsDateTime", () => {
  it("reads a UTC time as that instant", () => {
    const result = parseIcsDateTime(prop("20260115T100000Z"), "Asia/Kolkata");
    expect(result).not.toBeNull();
    expect(result!.allDay).toBe(false);
    expect(result!.timeZone).toBe("UTC");
    expect(result!.start.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });

  it("reads a VALUE=DATE as an all-day event at local midnight", () => {
    const result = parseIcsDateTime(prop("20260115", { VALUE: "DATE" }), "Asia/Kolkata");
    expect(result!.allDay).toBe(true);
    expect(result!.timeZone).toBe("Asia/Kolkata");
    // Kolkata is UTC+5:30, so local midnight is 18:30 the previous day UTC.
    expect(result!.start.toISOString()).toBe("2026-01-14T18:30:00.000Z");
  });

  it("reads a TZID time in that zone", () => {
    const result = parseIcsDateTime(prop("20260115T090000", { TZID: "America/New_York" }), "Asia/Kolkata");
    // January in New York is EST (UTC-5): 09:00 local = 14:00 UTC.
    expect(result!.timeZone).toBe("America/New_York");
    expect(result!.start.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("reads a floating time in the household zone", () => {
    const result = parseIcsDateTime(prop("20260115T090000"), "America/New_York");
    expect(result!.timeZone).toBe("America/New_York");
    expect(result!.start.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("falls back to the household zone for an unknown TZID", () => {
    const result = parseIcsDateTime(prop("20260115T090000", { TZID: "Mars/Olympus" }), "UTC");
    expect(result!.timeZone).toBe("UTC");
    expect(result!.start.toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("returns null for a value it cannot read", () => {
    expect(parseIcsDateTime(prop("not-a-date"), "UTC")).toBeNull();
  });
});

describe("zonedWallTimeToUtc across a DST boundary", () => {
  it("handles a summer time in New York (EDT, UTC-4)", () => {
    const at = zonedWallTimeToUtc({ year: 2026, month: 7, day: 1, hour: 12, minute: 0, second: 0 }, "America/New_York");
    expect(at.toISOString()).toBe("2026-07-01T16:00:00.000Z");
  });
});

describe("dateKeyInZone", () => {
  it("gives the local day in the zone", () => {
    expect(dateKeyInZone(new Date("2026-01-14T18:30:00.000Z"), "Asia/Kolkata")).toBe("2026-01-15");
  });
});

describe("isValidTimeZone", () => {
  it("accepts an IANA zone and rejects nonsense", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Nowhere/Nothing")).toBe(false);
  });
});
