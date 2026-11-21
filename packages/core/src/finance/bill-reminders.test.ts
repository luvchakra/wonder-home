import { describe, expect, it } from "vitest";

import { billSnoozeTime, snoozeBillReminders } from "./bill-reminders";

/** "Remind me on…" from a bill row (11-023): only the viewer's own waiting reminders, to 9 that morning. */

function fake(rows: { id: string }[]) {
  const filters: [string, unknown][] = [];
  const updates: unknown[] = [];
  const builder = () => {
    let op = "select";
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.limit = () => chain;
    chain.in = () => chain;
    chain.eq = (column: string, value: unknown) => (op === "select" && filters.push([column, value]), chain);
    chain.update = (values: unknown) => ((op = "update"), updates.push(values), chain);
    chain.maybeSingle = async () => ({ data: { snooze_count: 0, status: "delivered" }, error: null });
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(op === "update" ? { data: [{ id: "n1" }], error: null } : { data: rows, error: null }).then(resolve);
    return chain;
  };
  return { supabase: { from: builder } as never, filters, updates };
}

const now = new Date("2026-11-21T06:00:00Z");

describe("snoozing a bill's reminder (11-023)", () => {
  it("is 9 in the morning of the chosen day, in the household's zone, and only within a month", () => {
    expect(billSnoozeTime("2026-11-25", "Asia/Kolkata", now)?.toISOString()).toBe("2026-11-25T03:30:00.000Z");
    expect(billSnoozeTime("2026-11-20", "Asia/Kolkata", now)).toBeNull();
    expect(billSnoozeTime("2027-02-01", "Asia/Kolkata", now)).toBeNull();
  });

  it("moves only the viewer's own waiting reminders about this bill", async () => {
    const { supabase, filters, updates } = fake([{ id: "n1" }]);
    const result = await snoozeBillReminders(supabase, { householdId: "h1", memberId: "m1", obligationId: "b1", day: "2026-11-25", timeZone: "Asia/Kolkata" }, now);
    expect(result.count).toBe(1);
    expect(filters).toEqual(expect.arrayContaining([["recipient_member_id", "m1"], ["source_type", "obligation"], ["source_id", "b1"]]));
    expect(updates[0]).toMatchObject({ status: "generated", scheduled_for: "2026-11-25T03:30:00.000Z", snooze_count: 1 });
  });

  it("says so when no reminder about it is waiting", async () => {
    await expect(snoozeBillReminders(fake([]).supabase, { householdId: "h1", memberId: "m1", obligationId: "b1", day: "2026-11-25", timeZone: "Asia/Kolkata" }, now)).rejects.toThrow(/No reminder/);
  });
});
