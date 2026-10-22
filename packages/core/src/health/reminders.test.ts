import { describe, expect, it } from "vitest";

import { dueRemindersFor } from "./reminders";
import { routineDueNow } from "./routine-reminders";

const base = {
  startsAt: "2026-10-10T09:00:00Z",
  remindAdvance: true,
  remindPreparation: false,
  remindDayOf: true,
  preparationNotes: null as string | null,
};

describe("dueRemindersFor", () => {
  // `base` starts 2026-10-10 09:00 UTC; in UTC its day is the 10th.
  const UTC = "UTC";

  it("fires the advance reminder 3 days before, from 9:00 on the household's clock", () => {
    expect(dueRemindersFor(base, new Date("2026-10-07T10:00:00Z"), UTC)).toEqual(["advance"]);
    expect(dueRemindersFor(base, new Date("2026-10-07T08:00:00Z"), UTC)).toEqual([]);
  });

  it("fires the day-of reminder on the appointment's own day, from 7:00", () => {
    expect(dueRemindersFor(base, new Date("2026-10-10T07:05:00Z"), UTC)).toEqual(["day_of"]);
    expect(dueRemindersFor(base, new Date("2026-10-10T06:00:00Z"), UTC)).toEqual([]);
  });

  it("fires the day-of reminder two hours ahead of an early appointment, and never once it has begun", () => {
    const early = { ...base, startsAt: "2026-10-10T08:00:00Z" };
    expect(dueRemindersFor(early, new Date("2026-10-10T06:00:00Z"), UTC)).toEqual(["day_of"]);
    expect(dueRemindersFor(early, new Date("2026-10-10T05:30:00Z"), UTC)).toEqual([]);
    expect(dueRemindersFor(early, new Date("2026-10-10T08:00:00Z"), UTC)).toEqual([]);
  });

  it("reads the day on the household's clock, not UTC (the owner's review, 2026-10-22)", () => {
    // 04:00 IST on the 10th is 22:30 UTC on the 9th: read in UTC, "Today's the day" went out a day early.
    const early = { ...base, startsAt: "2026-10-09T22:30:00Z" };
    expect(dueRemindersFor(early, new Date("2026-10-09T03:00:00Z"), "Asia/Kolkata")).toEqual([]);
    // On the household's day, from two hours before (02:00 IST = 20:30 UTC on the 9th).
    expect(dueRemindersFor(early, new Date("2026-10-09T20:35:00Z"), "Asia/Kolkata")).toEqual(["day_of"]);
    expect(dueRemindersFor(early, new Date("2026-10-09T20:00:00Z"), "Asia/Kolkata")).toEqual([]);
  });

  it("fires nothing on an unrelated day", () => {
    expect(dueRemindersFor(base, new Date("2026-10-05T10:00:00Z"), UTC)).toEqual([]);
  });

  it("never fires the advance reminder when it is turned off", () => {
    expect(dueRemindersFor({ ...base, remindAdvance: false }, new Date("2026-10-07T10:00:00Z"), UTC)).toEqual([]);
  });

  it("only fires the preparation reminder when there is something to prepare", () => {
    const withoutNotes = { ...base, remindPreparation: true, preparationNotes: null };
    expect(dueRemindersFor(withoutNotes, new Date("2026-10-09T10:00:00Z"), UTC)).toEqual([]);

    const withNotes = { ...base, remindPreparation: true, preparationNotes: "Fast for 8 hours." };
    expect(dueRemindersFor(withNotes, new Date("2026-10-09T10:00:00Z"), UTC)).toEqual(["preparation"]);
  });

  it("never fires the day-of reminder when it is turned off", () => {
    expect(dueRemindersFor({ ...base, remindDayOf: false }, new Date("2026-10-10T07:05:00Z"), UTC)).toEqual([]);
  });
});

describe("routineDueNow", () => {
  it("asks for a measurement from 9:00 on its own day, on the household's clock", () => {
    // 03:00 UTC is 08:30 IST: not yet; 03:35 UTC is 09:05 IST.
    expect(routineDueNow("2026-10-22", new Date("2026-10-22T03:00:00Z"), "Asia/Kolkata")).toBe(false);
    expect(routineDueNow("2026-10-22", new Date("2026-10-22T03:35:00Z"), "Asia/Kolkata")).toBe(true);
    // 20:00 UTC on the 21st is 01:30 IST on the 22nd: the right day, too early.
    expect(routineDueNow("2026-10-22", new Date("2026-10-21T20:00:00Z"), "Asia/Kolkata")).toBe(false);
    expect(routineDueNow("2026-10-22", new Date("2026-10-23T05:00:00Z"), "Asia/Kolkata")).toBe(false);
  });
});
