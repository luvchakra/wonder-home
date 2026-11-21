import { describe, expect, it, vi } from "vitest";

vi.mock("../homebrain/context-store", () => ({ markContextStale: vi.fn(async () => undefined) }));

import { billPeriods } from "./periods";
import { endBillSeries, repeatOf, skipBillPeriod } from "./recurring";

/** Recurring bills done properly (11-022): repeat in words, skip a month, end the series. */

type Write = { table: string; op: string; values: unknown };

function fake(bill: Record<string, unknown>, opts: { skipError?: { code: string }; paid?: string[]; skips?: string[] } = {}) {
  const writes: Write[] = [];
  const builder = (table: string) => {
    let op = "select";
    let values: unknown;
    const result = () => {
      if (op !== "select") writes.push({ table, op, values });
      if (table === "obligations" && op === "select") return { data: bill, error: null };
      if (table === "obligation_skips" && op === "insert") return { data: null, error: opts.skipError ?? null };
      if (table === "obligation_history" && op === "select") return { data: (opts.paid ?? []).map((period_label) => ({ period_label, amount_minor: 100 })), error: null };
      if (table === "obligation_skips" && op === "select") return { data: (opts.skips ?? []).map((period_label) => ({ period_label })), error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const name of ["eq", "gte", "limit", "select"]) chain[name] = () => chain;
    chain.insert = (row: unknown) => ((op = "insert"), (values = row), chain);
    chain.update = (row: unknown) => ((op = "update"), (values = row), chain);
    chain.delete = () => ((op = "delete"), chain);
    chain.maybeSingle = async () => result();
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  return { supabase: { from: builder } as never, writes };
}

const rent = { id: "b1", status: "overdue", due_on: "2026-11-05", recurrence: "monthly", amount_minor: 2500000, currency: "INR" };

describe("recurring bills (11-022)", () => {
  it("says how a bill repeats from its own recurrence and due day", () => {
    expect(repeatOf("monthly", "2026-11-05")).toEqual({ every: "month", day: 5, dueOn: "2026-11-05" });
    expect(repeatOf("yearly", "2027-03-31")).toMatchObject({ every: "year", day: 31 });
    expect(repeatOf("one_off", "2026-11-05")).toBeNull();
    expect(repeatOf("monthly", null)).toBeNull();
  });

  it("skips this month: records the skip, pays nothing, and moves to next month with its amount not in yet", async () => {
    const { supabase, writes } = fake(rent);
    const skipped = await skipBillPeriod(supabase, { householdId: "h1", obligationId: "b1", memberId: "m1" });
    expect(skipped).toMatchObject({ periodLabel: "2026-11", nextDueOn: "2026-12-05", previous: { dueOn: "2026-11-05", amountMinor: 2500000 } });
    expect(writes.find((w) => w.table === "obligation_skips")!.values).toMatchObject({ period_label: "2026-11", skipped_by_member_id: "m1" });
    expect(writes.find((w) => w.table === "obligations")!.values).toEqual({ due_on: "2026-12-05", status: "expected", amount_minor: null, currency: null });
    expect(writes.some((w) => w.table === "obligation_history")).toBe(false);
  });

  it("passes over a month already paid ahead or skipped", async () => {
    const { supabase } = fake(rent, { paid: ["2026-12"], skips: ["2027-01"] });
    expect((await skipBillPeriod(supabase, { householdId: "h1", obligationId: "b1", memberId: "m1" })).nextDueOn).toBe("2027-02-05");
  });

  it("refuses a one-off bill, and says so before the migration runs", async () => {
    await expect(skipBillPeriod(fake({ ...rent, recurrence: "one_off" }).supabase, { householdId: "h1", obligationId: "b1", memberId: "m1" })).rejects.toThrow(/repeats/);
    await expect(skipBillPeriod(fake(rent, { skipError: { code: "PGRST205" } }).supabase, { householdId: "h1", obligationId: "b1", memberId: "m1" })).rejects.toThrow(/switched on/);
  });

  it("ends the series: the bill stops repeating and keeps how it repeated for Undo", async () => {
    const { supabase, writes } = fake(rent);
    expect(await endBillSeries(supabase, { householdId: "h1", obligationId: "b1" })).toEqual({ recurrence: "monthly" });
    expect(writes.find((w) => w.table === "obligations")!.values).toEqual({ recurrence: "one_off" });
  });

  it("shows a skipped month as Skipped, never as one to fill in", () => {
    const periods = billPeriods({ dueOn: "2026-12-05", recurrence: "monthly", status: "expected", amountMinor: null, currency: "INR" }, [], [], 0, 2, new Set(["2026-11"]));
    expect(periods.map((p) => [p.periodLabel, p.state])).toEqual([["2026-10", "earlier"], ["2026-11", "skipped"], ["2026-12", "due"]]);
  });
});
