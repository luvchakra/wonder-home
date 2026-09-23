import { describe, expect, it } from "vitest";

import { localInstant, localTimeValue, movedSchoolWhen, schoolDateValue, schoolWhen } from "./times";

describe("schoolWhen (14-014)", () => {
  it("a date with no time is all-day, on the long-standing midnight-UTC convention", () => {
    expect(schoolWhen({ date: "2026-09-26", timezone: "Asia/Kolkata" })).toEqual({ dueAt: "2026-09-26T00:00:00.000Z", dueTimeKnown: false, endsAt: null });
  });

  it("a local time is the real instant in the household's timezone", () => {
    expect(schoolWhen({ date: "2026-09-26", time: "09:00", timezone: "Asia/Kolkata" })).toEqual({ dueAt: "2026-09-26T03:30:00.000Z", dueTimeKnown: true, endsAt: null });
    expect(schoolWhen({ date: "2026-09-26", time: "09:00", endTime: "11:00", timezone: "Asia/Kolkata" }).endsAt).toBe("2026-09-26T05:30:00.000Z");
  });

  it("holds across a DST change", () => {
    expect(localInstant("2026-03-08", "09:00", "America/New_York")).toBe("2026-03-08T13:00:00.000Z");
    expect(localInstant("2026-03-07", "09:00", "America/New_York")).toBe("2026-03-07T14:00:00.000Z");
  });

  it("a time without a date decides nothing, and an end before the start is dropped", () => {
    expect(schoolWhen({ date: "", time: "09:00", timezone: "Asia/Kolkata" })).toEqual({ dueAt: null, dueTimeKnown: false, endsAt: null });
    expect(schoolWhen({ date: "2026-09-26", time: "11:00", endTime: "09:00", timezone: "Asia/Kolkata" }).endsAt).toBeNull();
    expect(schoolWhen({ date: "2026-09-26", time: "25:00", timezone: "Asia/Kolkata" }).dueTimeKnown).toBe(false);
  });

  it("reads back into the form's date and time", () => {
    const timed = { dueAt: new Date("2026-09-25T20:00:00.000Z"), dueTimeKnown: true };
    expect(schoolDateValue(timed, "Asia/Kolkata")).toBe("2026-09-26");
    expect(localTimeValue(timed.dueAt, "Asia/Kolkata")).toBe("01:30");
    expect(schoolDateValue({ dueAt: new Date("2026-09-26T00:00:00.000Z"), dueTimeKnown: false }, "America/Los_Angeles")).toBe("2026-09-26");
  });

  it("moving to another day keeps the local time and the length; an all-day item stays all-day", () => {
    const timed = { dueAt: new Date("2026-09-26T03:30:00.000Z"), dueTimeKnown: true, endsAt: new Date("2026-09-26T05:30:00.000Z") };
    expect(movedSchoolWhen(timed, "2026-10-03", "Asia/Kolkata")).toEqual({ dueAt: "2026-10-03T03:30:00.000Z", dueTimeKnown: true, endsAt: "2026-10-03T05:30:00.000Z" });
    const allDay = { dueAt: new Date("2026-09-26T00:00:00.000Z"), dueTimeKnown: false, endsAt: null };
    expect(movedSchoolWhen(allDay, "2026-10-03", "America/Los_Angeles")).toEqual({ dueAt: "2026-10-03T00:00:00.000Z", dueTimeKnown: false, endsAt: null });
  });
});

describe("showing when (14-014)", () => {
  it("an all-day item reads its day in UTC and shows no time", async () => {
    const { schoolDayZone, schoolTimeWords } = await import("./times");
    const allDay = { dueAt: new Date("2026-09-26T00:00:00.000Z"), dueTimeKnown: false, endsAt: null };
    expect(schoolDayZone(allDay, "America/Los_Angeles")).toBe("UTC");
    expect(schoolTimeWords(allDay, "Asia/Kolkata")).toBeNull();
  });

  it("a timed item shows its start, and its end when it has one", async () => {
    const { schoolDayZone, schoolTimeWords } = await import("./times");
    const timed = { dueAt: new Date("2026-09-26T03:30:00.000Z"), dueTimeKnown: true, endsAt: new Date("2026-09-26T05:30:00.000Z") };
    expect(schoolDayZone(timed, "Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(schoolTimeWords(timed, "Asia/Kolkata")).toBe("9:00 AM – 11:00 AM");
    expect(schoolTimeWords({ ...timed, endsAt: null }, "Asia/Kolkata")).toBe("9:00 AM");
  });
});
