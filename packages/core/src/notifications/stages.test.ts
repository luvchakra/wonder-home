import { describe, expect, it } from "vitest";

import { advanceDueStages, STAGE_HOUSEHOLDS_PER_TICK, type ReconcileResult } from "./reconcile";
import { sameOccasionAsEvent, type FamilyEventRow, type SchoolItemRow } from "./sources";

const IST = "Asia/Kolkata";

describe("one reminder per occasion (the owner's review, 2026-10-22)", () => {
  const trip: FamilyEventRow = { id: "bounce", title: "Bounce School Trip", kind: "school_event", starts_at: "2026-10-22T02:30:00Z", status: "planned", owner_member_id: "kunal" };
  const notice: SchoolItemRow = { id: "s1", child_member_id: "asmi", kind: "event", title: "Field trip to Bounce", due_at: "2026-10-22T02:00:00Z", due_time_known: true, status: "pending" };

  it("drops the school entry's reminder when a family event that day is the same occasion by another name", () => {
    expect(sameOccasionAsEvent(notice, [trip], IST)).toBe(true);
  });

  it("matches an entry with no time by its own day", () => {
    expect(sameOccasionAsEvent({ ...notice, due_at: "2026-10-22T00:00:00Z", due_time_known: false }, [trip], IST)).toBe(true);
  });

  it("keeps it on another day, for another thing, or when the event was cancelled", () => {
    expect(sameOccasionAsEvent(notice, [{ ...trip, starts_at: "2026-10-29T02:30:00Z" }], IST)).toBe(false);
    expect(sameOccasionAsEvent({ ...notice, title: "Maths worksheet" }, [trip], IST)).toBe(false);
    expect(sameOccasionAsEvent(notice, [{ ...trip, status: "cancelled" }], IST)).toBe(false);
    expect(sameOccasionAsEvent({ ...notice, due_at: null }, [trip], IST)).toBe(false);
    expect(sameOccasionAsEvent(notice, [], IST)).toBe(false);
  });
});

describe("the delivery clock moves reminders to their next stage", () => {
  const ran: ReconcileResult = { ran: true, created: 1, updated: 0, resolved: 0, expired: 0, delivered: 1 };
  const skipped: ReconcileResult = { ran: false, created: 0, updated: 0, resolved: 0, expired: 0, delivered: 0 };

  /** Just enough of the two reads: open reminders, and when each household last had a pass. */
  function fakeAdmin(openHouseholds: (string | { household_id: string; expires_at: string | null })[], lastPass: Record<string, string>, failOpen = false) {
    const calls: { table: string; filters: string[] }[] = [];
    const admin = {
      from(table: string) {
        const call = { table, filters: [] as string[] };
        calls.push(call);
        const result =
          table === "notifications"
            ? failOpen
              ? { data: null, error: { code: "x" } }
              : { data: openHouseholds.map((row) => (typeof row === "string" ? { household_id: row, expires_at: null } : row)), error: null }
            : { data: Object.entries(lastPass).map(([household_id, reconciled_at]) => ({ household_id, reconciled_at })), error: null };
        const chain: Record<string, unknown> = {
          select: () => chain,
          in: (column: string, values: unknown[]) => (call.filters.push(`${column} in ${JSON.stringify(values)}`), chain),
          or: (filter: string) => (call.filters.push(filter), chain),
          limit: async () => result,
          then: (resolve: (value: unknown) => unknown) => resolve(result),
        };
        return chain;
      },
    };
    return { admin: admin as never, calls };
  }

  it("takes each household with an open reminder once, the longest-waiting first, and counts those that ran", async () => {
    const { admin, calls } = fakeAdmin(["a", "b", "a", "c", { household_id: "gone", expires_at: "2026-10-22T01:00:00Z" }], { a: "2026-10-22T01:20:00Z", b: "2026-10-22T00:10:00Z" });
    const order: string[] = [];
    const summary = await advanceDueStages(admin, new Date("2026-10-22T01:30:00Z"), {
      pass: async (householdId) => {
        order.push(householdId);
        return householdId === "a" ? skipped : ran;
      },
    });
    // c has never had a pass, then b (00:10), then a (01:20); "gone" has only an expired reminder.
    expect(order).toEqual(["c", "b", "a"]);
    expect(summary).toMatchObject({ households: 2, created: 2, delivered: 2 });
    const open = calls.find((call) => call.table === "notifications")!;
    expect(open.filters).toContain('status in ["generated","delivered","seen"]');

  });

  it("is bounded per tick", async () => {
    const many = Array.from({ length: STAGE_HOUSEHOLDS_PER_TICK + 10 }, (_, index) => `h${index}`);
    const { admin } = fakeAdmin(many, {});
    let passes = 0;
    await advanceDueStages(admin, new Date(), { pass: async () => (passes++, ran) });
    expect(passes).toBe(STAGE_HOUSEHOLDS_PER_TICK);
  });

  it("does nothing when there is nothing open, or the read fails", async () => {
    let passes = 0;
    const pass = async () => (passes++, ran);
    expect((await advanceDueStages(fakeAdmin([], {}).admin, new Date(), { pass })).households).toBe(0);
    expect((await advanceDueStages(fakeAdmin(["a"], {}, true).admin, new Date(), { pass })).households).toBe(0);
    expect(passes).toBe(0);
  });
});
