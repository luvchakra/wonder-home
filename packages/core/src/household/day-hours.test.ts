import { describe, expect, it } from "vitest";

import { hoursFromRow, minuteOf, readHoursInput } from "./day-hours";

describe("a usual day's hours", () => {
  it("reads a clock time, with or without seconds", () => {
    expect(minuteOf("15:30")).toBe(930);
    expect(minuteOf("08:05:00")).toBe(485);
    expect(minuteOf("24:00")).toBeNull();
    expect(minuteOf("3pm")).toBeNull();
    expect(minuteOf(null)).toBeNull();
  });

  it("reads a stored pair back, or nothing", () => {
    expect(hoursFromRow("08:00:00", "15:10:00")).toEqual({ starts: "08:00", ends: "15:10" });
    expect(hoursFromRow("08:00:00", null)).toBeNull();
  });

  it("clears on two blanks and asks on one", () => {
    expect(readHoursInput("", "", { overnight: false })).toEqual({ ok: true, hours: null });
    expect(readHoursInput("08:00", "", { overnight: false })).toEqual({ ok: false, problem: "half" });
    expect(readHoursInput(null, "15:00", { overnight: false })).toEqual({ ok: false, problem: "half" });
  });

  it("keeps a school day inside one day, but lets a night shift wrap", () => {
    expect(readHoursInput("15:00", "08:00", { overnight: false })).toEqual({ ok: false, problem: "ends_first" });
    expect(readHoursInput("22:00", "06:00", { overnight: true })).toEqual({ ok: true, hours: { starts: "22:00", ends: "06:00" } });
    expect(readHoursInput("09:00", "09:00", { overnight: true })).toEqual({ ok: false, problem: "same" });
    expect(readHoursInput("9", "17:00", { overnight: true })).toEqual({ ok: false, problem: "unreadable" });
  });
});

describe("saying the hours", () => {
  it("says them through the reader's own time format", async () => {
    const { hoursLabel } = await import("./day-hours");
    const hhmmUtc = (value: Date) => value.toISOString().slice(11, 16);
    expect(hoursLabel({ starts: "09:30", ends: "18:00" }, hhmmUtc)).toBe("09:30 – 18:00");
  });
});
