import { describe, expect, it } from "vitest";

import { atLocal, localMoment } from "./dates";
import { expandSeries, parseRecurrence, type SeriesInput } from "./recurrence";

const KOLKATA = "Asia/Kolkata";
const LONDON = "Europe/London";

function series(partial: Partial<SeriesInput> & { start: Date; end: Date }): SeriesInput {
  return { allDay: false, timeZone: KOLKATA, rule: null, ...partial };
}

const dates = (occurrences: { occurrenceDate: string }[]) => occurrences.map((o) => o.occurrenceDate);

describe("parseRecurrence", () => {
  it("accepts the subset and nothing else, like wh.valid_recurrence", () => {
    expect(parseRecurrence({ freq: "weekly", byWeekday: [3, 1, 1] })).toEqual({ freq: "weekly", byWeekday: [1, 3] });
    expect(parseRecurrence({ freq: "monthly", interval: 2, until: "2027-06-30" })).toEqual({ freq: "monthly", interval: 2, until: "2027-06-30" });
    for (const bad of [null, {}, [], { freq: "hourly" }, { freq: "daily", interval: 0 }, { freq: "daily", interval: 1.5 }, { freq: "daily", byWeekday: [1] }, { freq: "weekly", byWeekday: [7] }, { freq: "weekly", byWeekday: [] }, { freq: "weekly", until: "2027-02-30" }, { freq: "weekly", until: "2027-01-01", count: 2 }, { freq: "weekly", count: 501 }, { freq: "weekly", extra: true }]) {
      expect(parseRecurrence(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("expandSeries", () => {
  it("returns a one-off event when it touches the range, and nothing otherwise", () => {
    const event = series({ start: atLocal("2026-10-20", 19 * 60, KOLKATA), end: atLocal("2026-10-20", 21 * 60, KOLKATA) });
    expect(dates(expandSeries(event, { from: "2026-10-01", to: "2026-10-31" }))).toEqual(["2026-10-20"]);
    expect(expandSeries(event, { from: "2026-11-01", to: "2026-11-30" })).toEqual([]);
  });

  it("keeps the local wall-clock time across a daylight-saving change", () => {
    // London leaves summer time on 25 Oct 2026.
    const event = series({ timeZone: LONDON, start: atLocal("2026-10-18", 19 * 60, LONDON), end: atLocal("2026-10-18", 20 * 60, LONDON), rule: { freq: "weekly" } });
    const out = expandSeries(event, { from: "2026-10-18", to: "2026-11-01" });
    expect(dates(out)).toEqual(["2026-10-18", "2026-10-25", "2026-11-01"]);
    for (const occurrence of out) {
      expect(localMoment(occurrence.start, LONDON).hour).toBe(19);
      expect(occurrence.end.getTime() - occurrence.start.getTime()).toBe(60 * 60 * 1000);
    }
  });

  it("skips months without the day rather than moving it", () => {
    const event = series({ start: atLocal("2026-01-31", 9 * 60, KOLKATA), end: atLocal("2026-01-31", 10 * 60, KOLKATA), rule: { freq: "monthly" } });
    expect(dates(expandSeries(event, { from: "2026-01-01", to: "2026-06-30" }))).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
  });

  it("puts a 29 February birthday-style event in leap years only", () => {
    const event = series({ allDay: true, start: atLocal("2024-02-29", 0, KOLKATA), end: atLocal("2024-03-01", 0, KOLKATA), rule: { freq: "yearly" } });
    expect(dates(expandSeries(event, { from: "2025-01-01", to: "2028-12-31" }))).toEqual(["2028-02-29"]);
  });

  it("stops at until and at count, counting from the first occurrence", () => {
    const start = atLocal("2026-10-01", 7 * 60, KOLKATA);
    const end = atLocal("2026-10-01", 8 * 60, KOLKATA);
    expect(dates(expandSeries(series({ start, end, rule: { freq: "daily", until: "2026-10-03" } }), { from: "2026-10-01", to: "2026-10-31" }))).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    // Ten in all: the range only sees the last two.
    expect(dates(expandSeries(series({ start, end, rule: { freq: "daily", count: 10 } }), { from: "2026-10-09", to: "2026-10-31" }))).toEqual(["2026-10-09", "2026-10-10"]);
  });

  it("repeats on the chosen weekdays, every other week", () => {
    // 5 Oct 2026 is a Monday.
    const event = series({ start: atLocal("2026-10-05", 17 * 60, KOLKATA), end: atLocal("2026-10-05", 18 * 60, KOLKATA), rule: { freq: "weekly", interval: 2, byWeekday: [1, 4] } });
    expect(dates(expandSeries(event, { from: "2026-10-01", to: "2026-10-31" }))).toEqual(["2026-10-05", "2026-10-08", "2026-10-19", "2026-10-22"]);
  });

  it("applies a cancelled or moved occurrence and keeps its identity", () => {
    const event = series({ start: atLocal("2026-10-03", 10 * 60, KOLKATA), end: atLocal("2026-10-03", 11 * 60, KOLKATA), rule: { freq: "weekly" } });
    const moved = atLocal("2026-10-11", 16 * 60, KOLKATA);
    const out = expandSeries(event, { from: "2026-10-01", to: "2026-10-31" }, [
      { occurrenceDate: "2026-10-17", cancelled: true },
      { occurrenceDate: "2026-10-10", cancelled: false, startsAt: moved, endsAt: new Date(moved.getTime() + 3_600_000), title: "Swimming (Sunday)" },
    ]);
    expect(dates(out)).toEqual(["2026-10-03", "2026-10-10", "2026-10-24", "2026-10-31"]);
    expect(out[1]!.start).toEqual(moved);
    expect(out[1]!.exception?.title).toBe("Swimming (Sunday)");
  });

  it("is bounded for a daily series with no end over a far range", () => {
    const event = series({ start: atLocal("2020-01-01", 6 * 60, KOLKATA), end: atLocal("2020-01-01", 7 * 60, KOLKATA), rule: { freq: "daily" } });
    const out = expandSeries(event, { from: "2027-01-01", to: "2027-12-31" });
    expect(out.length).toBe(365);
    expect(out[0]!.occurrenceDate).toBe("2027-01-01");
  });

  it("shows a multi-day all-day occurrence on every day it covers", () => {
    const event = series({ allDay: true, start: atLocal("2026-12-24", 0, KOLKATA), end: atLocal("2026-12-27", 0, KOLKATA), rule: { freq: "yearly" } });
    // The 2026 one runs 24–26 Dec, so a range starting on the 26th still sees it.
    expect(dates(expandSeries(event, { from: "2026-12-26", to: "2027-01-05" }))).toEqual(["2026-12-24"]);
  });
});
