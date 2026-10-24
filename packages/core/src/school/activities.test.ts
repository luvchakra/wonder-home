import { describe, expect, it } from "vitest";

import { activityEntries, isoWeekday, orderedNotes, sameActivityName, sessionDates, type Activity } from "./activities";

const activity = (extra: Partial<Activity> = {}): Activity => ({
  id: "piano",
  childMemberId: "anya",
  name: "Piano",
  kind: "music",
  description: "Grade 2 with Mrs Sen",
  teacherName: "Mrs Sen",
  teacherContact: null,
  place: { name: "Sen Music School", placeId: "p1", address: "Indiranagar", location: null },
  days: [2, 4],
  startsAt: "17:00",
  endsAt: "18:00",
  startsOn: null,
  endsOn: null,
  notes: null,
  items: [],
  ...extra,
});
const viewer = { memberId: "kunal", isAdmin: true, timeZone: "Asia/Kolkata" };

describe("isoWeekday", () => {
  it("counts Monday as 1 and Sunday as 7", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-25")).toBe(7);
  });
});

describe("sessionDates", () => {
  it("is every Tuesday and Thursday in the range", () => {
    expect(sessionDates(activity(), { from: "2026-10-19", to: "2026-10-25" })).toEqual(["2026-10-20", "2026-10-22"]);
  });

  it("stays inside the class's own start and end", () => {
    expect(sessionDates(activity({ startsOn: "2026-10-21", endsOn: "2026-10-29" }), { from: "2026-10-19", to: "2026-11-01" })).toEqual(["2026-10-22", "2026-10-27", "2026-10-29"]);
    expect(sessionDates(activity({ endsOn: "2026-10-01" }), { from: "2026-10-19", to: "2026-10-25" })).toEqual([]);
  });

  it("has no sessions without a weekly day", () => {
    expect(sessionDates(activity({ days: [] }), { from: "2026-10-19", to: "2026-10-25" })).toEqual([]);
  });
});

describe("activityEntries", () => {
  it("puts a class's exam on the Calendar once, at its own time, beside its sessions (the owner's karate exam, 2026-10-24)", () => {
    const karate = activity({
      id: "karate",
      name: "Karate",
      days: [],
      startsAt: null,
      endsAt: null,
      items: [
        { id: "belt", activityId: "karate", kind: "exam", title: "Karate belt exam", onDate: "2026-10-25", startsAt: "09:30", endsAt: null, detail: null, result: null },
        { id: "gold", activityId: "karate", kind: "award", title: "Gold", onDate: "2026-10-25", startsAt: null, endsAt: null, detail: null, result: "Gold" },
      ],
    });
    const entries = activityEntries([karate], viewer, { from: "2026-10-19", to: "2026-10-31" });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "activity-note:belt", title: "Karate belt exam", detail: "Karate", allDay: false, repeats: false, memberIds: ["anya"] });
    expect(entries[0]!.start.toISOString()).toBe("2026-10-25T04:00:00.000Z");
    // Outside the range it is not there.
    expect(activityEntries([karate], viewer, { from: "2026-10-26", to: "2026-10-31" })).toEqual([]);
  });

  it("puts each session on the calendar at its local time, for that child, opening on Kids & School", () => {
    const [first] = activityEntries([activity()], viewer, { from: "2026-10-20", to: "2026-10-20" });
    expect(first).toEqual(
      expect.objectContaining({
        id: "activity:piano:2026-10-20",
        source: "activity",
        title: "Piano",
        detail: "Sen Music School",
        allDay: false,
        category: "school",
        memberIds: ["anya"],
        href: "/school?child=anya",
        can: { edit: false },
      }),
    );
    expect(first!.start.toISOString()).toBe("2026-10-20T11:30:00.000Z");
    expect(first!.end!.toISOString()).toBe("2026-10-20T12:30:00.000Z");
  });

  it("is all day when no time was given, and an hour when only a start was", () => {
    expect(activityEntries([activity({ startsAt: null, endsAt: null })], viewer, { from: "2026-10-20", to: "2026-10-20" })[0]!.allDay).toBe(true);
    const [open] = activityEntries([activity({ endsAt: null })], viewer, { from: "2026-10-20", to: "2026-10-20" });
    expect(open!.end!.getTime() - open!.start.getTime()).toBe(3_600_000);
  });
});

describe("orderedNotes", () => {
    const note = (id: string, kind: "competition" | "exam" | "event" | "award" | "note", onDate: string | null) => ({ id, activityId: "piano", kind, title: id, onDate, startsAt: null, endsAt: null, detail: null, result: null });

  it("lists competitions still to come soonest first, and the rest newest first", () => {
    const { upcoming, past } = orderedNotes(
      [note("recital", "competition", "2026-12-05"), note("fest", "competition", "2026-11-02"), note("old", "competition", "2026-05-01"), note("gold", "award", "2026-06-01"), note("tip", "note", null)],
      "2026-10-18",
    );
    expect(upcoming.map((item) => item.id)).toEqual(["fest", "recital"]);
    expect(past.map((item) => item.id)).toEqual(["gold", "old", "tip"]);
  });

  it("an exam or an event still to come is coming up too", () => {
    const { upcoming } = orderedNotes([note("belt", "exam", "2026-10-25"), note("show", "event", "2026-11-01"), note("tip", "note", "2026-10-30")], "2026-10-24");
    expect(upcoming.map((item) => item.id)).toEqual(["belt", "show"]);
  });
});

describe("sameActivityName", () => {
  it("finds the child's class by its name, however it is written", () => {
    expect(sameActivityName("Karate", "karate")).toBe(true);
    expect(sameActivityName("Karate class", "Karate")).toBe(true);
    expect(sameActivityName("Shotokan Karate", "Karate")).toBe(true);
    expect(sameActivityName("Karate", "Kathak")).toBe(false);
    expect(sameActivityName("Piano", "")).toBe(false);
  });
});
