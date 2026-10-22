import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FamilyEvent } from "../family/schedule";

const created = { event: [] as unknown[], school: [] as unknown[] };
let events: FamilyEvent[] = [];
let schoolRows: { id: string; title: string; due_at: string; due_time_known: boolean }[] = [];
let readFails = false;

vi.mock("../family/repository", () => ({
  listEvents: async () => {
    if (readFails) throw new Error("read failed");
    return events;
  },
  createEvent: async (_supabase: unknown, input: unknown) => {
    created.event.push(input);
    return { id: "new-event" };
  },
}));
vi.mock("../school/repository", () => ({
  createSchoolItem: async (_supabase: unknown, input: unknown) => {
    created.school.push(input);
    return { id: "new-school" };
  },
}));

const { addFamilyEvent, addSchoolItem, duplicateConflict } = await import("./add-event");

/** Just enough of a Supabase client for the school_items read. */
const supabase = {
  from: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      neq: () => chain,
      limit: async () => ({ data: schoolRows, error: null }),
    };
    return chain;
  },
} as never;

const IST = "Asia/Kolkata";
const trip = (over: Partial<FamilyEvent> = {}): FamilyEvent => ({
  id: "bounce",
  title: "Bounce School Trip",
  kind: "school_event",
  startsAt: new Date("2026-10-22T02:30:00Z"),
  endsAt: new Date("2026-10-22T09:30:00Z"),
  protected: true,
  ownerMemberId: "kunal",
  status: "planned",
  actionState: null,
  actionDueAt: null,
  participants: [],
  ...over,
});

beforeEach(() => {
  created.event = [];
  created.school = [];
  events = [];
  schoolRows = [];
  readFails = false;
});

describe("HomeEvents' one door (the owner, 2026-10-22)", () => {
  const notice = { householdId: "h", childMemberId: "asmi", kind: "event" as const, title: "Field trip to Bounce", dueAt: "2026-10-22T02:00:00.000Z", dueTimeKnown: true };

  it("refuses the school notice's trip when the family already has it by another name that day", async () => {
    events = [trip()];
    const result = await addSchoolItem(supabase, notice, { timeZone: IST });
    expect(result).toEqual({ kind: "duplicate", existing: { sourceId: "bounce", title: "Bounce School Trip", start: trip().startsAt, source: "event" } });
    expect(created.school).toEqual([]);
  });

  it("refuses a family event when a school entry with no time holds it that day", async () => {
    schoolRows = [{ id: "s1", title: "Field trip to Bounce", due_at: "2026-10-22T00:00:00.000Z", due_time_known: false }];
    const result = await addFamilyEvent(supabase, { householdId: "h", title: "Bounce School Trip", startsAt: "2026-10-22T02:30:00Z", endsAt: "2026-10-22T09:30:00Z" }, { timeZone: IST });
    expect(result).toMatchObject({ kind: "duplicate", existing: { sourceId: "s1", source: "school" } });
    expect(created.event).toEqual([]);
  });

  it("adds it anyway when the person said so", async () => {
    events = [trip()];
    expect(await addSchoolItem(supabase, notice, { timeZone: IST, confirmed: true })).toEqual({ kind: "added", id: "new-school" });
    expect(created.school).toHaveLength(1);
  });

  it("adds the same name on another day, and anything when the calendar cannot be read", async () => {
    events = [trip({ startsAt: new Date("2026-10-29T02:30:00Z"), endsAt: new Date("2026-10-29T09:30:00Z") })];
    expect((await addSchoolItem(supabase, notice, { timeZone: IST })).kind).toBe("added");
    readFails = true;
    events = [trip()];
    expect((await addSchoolItem(supabase, notice, { timeZone: IST })).kind).toBe("added");
  });

  it("never counts a cancelled event, and adds a school entry with no date", async () => {
    events = [trip({ status: "cancelled" })];
    expect((await addSchoolItem(supabase, notice, { timeZone: IST })).kind).toBe("added");
    expect((await addSchoolItem(supabase, { ...notice, dueAt: null }, { timeZone: IST })).kind).toBe("added");
  });

  it("tells an API caller which entry is there and how to add anyway", () => {
    const error = duplicateConflict({ sourceId: "bounce", title: "Bounce School Trip", start: new Date("2026-10-22T02:30:00Z"), source: "event" });
    expect(error.code).toBe("conflict");
    expect(error.message).toContain("confirmDuplicate");
    expect(error.details).toEqual({ existing: { id: "bounce", title: "Bounce School Trip", startsAt: "2026-10-22T02:30:00.000Z", source: "event" } });
  });
});
