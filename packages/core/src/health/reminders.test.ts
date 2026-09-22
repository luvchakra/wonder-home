import { describe, expect, it } from "vitest";

import { dueRemindersFor } from "./reminders";

const base = {
  startsAt: "2026-10-10T09:00:00Z",
  remindAdvance: true,
  remindPreparation: false,
  remindDayOf: true,
  preparationNotes: null as string | null,
};

describe("dueRemindersFor", () => {
  it("fires the advance reminder exactly 3 days before", () => {
    expect(dueRemindersFor(base, new Date("2026-10-07T00:00:00Z"))).toEqual(["advance"]);
  });

  it("fires the day-of reminder on the appointment's own day", () => {
    expect(dueRemindersFor(base, new Date("2026-10-10T00:00:00Z"))).toEqual(["day_of"]);
  });

  it("fires nothing on an unrelated day", () => {
    expect(dueRemindersFor(base, new Date("2026-10-05T00:00:00Z"))).toEqual([]);
  });

  it("never fires the advance reminder when it is turned off", () => {
    expect(dueRemindersFor({ ...base, remindAdvance: false }, new Date("2026-10-07T00:00:00Z"))).toEqual([]);
  });

  it("only fires the preparation reminder when there is something to prepare", () => {
    const withoutNotes = { ...base, remindPreparation: true, preparationNotes: null };
    expect(dueRemindersFor(withoutNotes, new Date("2026-10-09T00:00:00Z"))).toEqual([]);

    const withNotes = { ...base, remindPreparation: true, preparationNotes: "Fast for 8 hours." };
    expect(dueRemindersFor(withNotes, new Date("2026-10-09T00:00:00Z"))).toEqual(["preparation"]);
  });

  it("never fires the day-of reminder when it is turned off", () => {
    expect(dueRemindersFor({ ...base, remindDayOf: false }, new Date("2026-10-10T00:00:00Z"))).toEqual([]);
  });
});
