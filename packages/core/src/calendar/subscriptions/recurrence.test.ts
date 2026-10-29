import { describe, expect, it } from "vitest";

import { dateKeyInZone } from "./time";
import { expandRecurrence, parseRrule } from "./recurrence";

const UTC = "UTC";
const wall = (year: number, month: number, day: number, hour = 9) => ({ year, month, day, hour, minute: 0, second: 0 });
const window = (fromIso: string, toIso: string) => ({ start: new Date(fromIso), end: new Date(toIso) });

describe("parseRrule", () => {
  it("parses FREQ, INTERVAL, COUNT, UNTIL and BYDAY", () => {
    const rule = parseRrule("FREQ=WEEKLY;INTERVAL=2;COUNT=10;BYDAY=MO,WE,FR");
    expect(rule).toMatchObject({ freq: "WEEKLY", interval: 2, count: 10, byday: [1, 3, 5] });
  });

  it("returns null for an unknown FREQ", () => {
    expect(parseRrule("FREQ=HOURLY")).toBeNull();
    expect(parseRrule("INTERVAL=1")).toBeNull();
  });
});

describe("expandRecurrence", () => {
  it("expands DAILY within the window", () => {
    const rule = parseRrule("FREQ=DAILY;COUNT=5")!;
    const result = expandRecurrence({ startWall: wall(2026, 1, 1), tz: UTC, rule, window: window("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z"), exdateKeys: new Set() });
    expect(result.supported).toBe(true);
    expect(result.starts.map((d) => dateKeyInZone(d, UTC))).toEqual(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"]);
  });

  it("expands WEEKLY with BYDAY", () => {
    // 2026-01-01 is a Thursday; Mondays and Fridays, 3 occurrences.
    const rule = parseRrule("FREQ=WEEKLY;BYDAY=MO,FR;COUNT=3")!;
    const result = expandRecurrence({ startWall: wall(2026, 1, 1), tz: UTC, rule, window: window("2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"), exdateKeys: new Set() });
    expect(result.starts.map((d) => dateKeyInZone(d, UTC))).toEqual(["2026-01-02", "2026-01-05", "2026-01-09"]);
  });

  it("honours UNTIL", () => {
    const rule = parseRrule("FREQ=DAILY;UNTIL=20260103T090000Z")!;
    const result = expandRecurrence({ startWall: wall(2026, 1, 1), tz: UTC, rule, window: window("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z"), exdateKeys: new Set() });
    expect(result.starts.map((d) => dateKeyInZone(d, UTC))).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("honours EXDATE", () => {
    const rule = parseRrule("FREQ=DAILY;COUNT=4")!;
    const result = expandRecurrence({ startWall: wall(2026, 1, 1), tz: UTC, rule, window: window("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z"), exdateKeys: new Set(["2026-01-02"]) });
    expect(result.starts.map((d) => dateKeyInZone(d, UTC))).toEqual(["2026-01-01", "2026-01-03", "2026-01-04"]);
  });

  it("expands MONTHLY and skips an impossible day", () => {
    // 31st monthly: Jan 31, Mar 31 (Feb has no 31st and is skipped).
    const rule = parseRrule("FREQ=MONTHLY;COUNT=2")!;
    const result = expandRecurrence({ startWall: wall(2026, 1, 31), tz: UTC, rule, window: window("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z"), exdateKeys: new Set() });
    expect(result.starts.map((d) => dateKeyInZone(d, UTC))).toEqual(["2026-01-31", "2026-03-31"]);
  });

  it("expands YEARLY", () => {
    const rule = parseRrule("FREQ=YEARLY;COUNT=2")!;
    const result = expandRecurrence({ startWall: wall(2026, 3, 15), tz: UTC, rule, window: window("2026-01-01T00:00:00Z", "2028-12-31T00:00:00Z"), exdateKeys: new Set() });
    expect(result.starts.map((d) => dateKeyInZone(d, UTC))).toEqual(["2026-03-15", "2027-03-15"]);
  });

  it("caps the number of occurrences", () => {
    const rule = parseRrule("FREQ=DAILY")!; // no COUNT/UNTIL — infinite
    const result = expandRecurrence({ startWall: wall(2026, 1, 1), tz: UTC, rule, window: window("2026-01-01T00:00:00Z", "2030-12-31T00:00:00Z"), exdateKeys: new Set(), cap: 10 });
    expect(result.starts).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it("clips to the window's start", () => {
    const rule = parseRrule("FREQ=DAILY;COUNT=10")!;
    const result = expandRecurrence({ startWall: wall(2026, 1, 1), tz: UTC, rule, window: window("2026-01-05T00:00:00Z", "2026-12-31T00:00:00Z"), exdateKeys: new Set() });
    // Occurrences before Jan 5 are generated for COUNT but not collected.
    expect(result.starts.map((d) => dateKeyInZone(d, UTC))).toEqual(["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10"]);
  });
});
