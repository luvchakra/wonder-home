import { describe, expect, it, vi } from "vitest";

vi.mock("../homebrain/context-store", () => ({ markContextStale: vi.fn(async () => undefined) }));

import { markObligationPaid, markObligationUnpaid } from "./repository";

/**
 * "Mark as paid" and "Mark as unpaid" on the Bills screen (the owner,
 * 2026-11-21): recording a payment made elsewhere, and taking it back. The
 * state machine: waiting → paid (one-off) or → next period (recurring);
 * paid → waiting again, its recorded payment out of the totals.
 */

type Write = { table: string; op: string; values: Record<string, unknown> };

function fakeDatabase(bill: Record<string, unknown>, monthRow: Record<string, unknown> | null = null) {
  const writes: Write[] = [];
  const builder = (table: string) => {
    let op = "select";
    let values: Record<string, unknown> = {};
    let single = false;
    const result = () => {
      if (op !== "select") writes.push({ table, op, values });
      if (op === "insert") return { data: { id: "new-bill" }, error: null };
      if (table === "obligations" && op === "select") return { data: bill, error: null };
      if (table === "obligation_history" && op === "select" && single) return { data: monthRow, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const name of ["eq", "gte", "lte", "in", "limit", "order", "select", "is", "neq"]) chain[name] = () => chain;
    chain.insert = (row: Record<string, unknown>) => ((op = "insert"), (values = row), chain);
    chain.update = (row: Record<string, unknown>) => ((op = "update"), (values = row), chain);
    chain.upsert = (row: Record<string, unknown>) => ((op = "upsert"), (values = row), chain);
    chain.delete = () => ((op = "delete"), chain);
    chain.maybeSingle = async () => ((single = true), result());
    chain.single = async () => result();
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  const supabase = { from: (table: string) => builder(table), rpc: async () => ({ data: null, error: null }) };
  return { supabase: supabase as never, writes };
}

const oneOff = { id: "b1", status: "overdue", due_on: "2026-11-02", recurrence: "one_off", amount_minor: 30000, currency: "INR", payee: "School", kind: "school_fee", responsible_member_id: "m-owner" };

describe("marking a bill paid", () => {
  it("settles a one-off bill and records its own amount, for whoever paid", async () => {
    const { supabase, writes } = fakeDatabase(oneOff);
    const paid = await markObligationPaid(supabase, { householdId: "h1", obligationId: "b1", paidOn: "2026-11-21", paidByMemberId: "m-spouse" });
    expect(paid).toMatchObject({ nextDueOn: null, periodLabel: "2026-11", recorded: true, previous: { status: "overdue", amountMinor: 30000 } });
    const history = writes.find((write) => write.table === "obligation_history")!;
    expect(history.values).toMatchObject({ amount_minor: 30000, currency: "INR", paid_on: "2026-11-21", owner_member_id: "m-spouse" });
    expect(writes.find((write) => write.table === "obligations" && write.op === "update")!.values).toEqual({ status: "paid" });
  });

  it("falls back to whoever handles the bill when nobody says who paid", async () => {
    const { supabase, writes } = fakeDatabase(oneOff);
    await markObligationPaid(supabase, { householdId: "h1", obligationId: "b1", paidOn: "2026-11-21" });
    expect(writes.find((write) => write.table === "obligation_history")!.values.owner_member_id).toBe("m-owner");
  });

  it("settles a bill whose amount is not in yet without inventing one", async () => {
    const { supabase, writes } = fakeDatabase({ ...oneOff, amount_minor: null, currency: null });
    const paid = await markObligationPaid(supabase, { householdId: "h1", obligationId: "b1", paidOn: "2026-11-21" });
    expect(paid.recorded).toBe(false);
    expect(writes.some((write) => write.table === "obligation_history")).toBe(false);
  });

  it("keeps a recurring bill due for its next month", async () => {
    const { supabase, writes } = fakeDatabase({ ...oneOff, recurrence: "monthly", due_on: "2026-10-01" });
    const paid = await markObligationPaid(supabase, { householdId: "h1", obligationId: "b1", paidOn: "2026-10-01" });
    expect(paid.nextDueOn).toBe("2026-11-01");
    expect(writes.find((write) => write.table === "obligations" && write.op === "update")!.values).toMatchObject({ status: "expected", due_on: "2026-11-01" });
  });

  it("refuses a bill already settled", async () => {
    const { supabase } = fakeDatabase({ ...oneOff, status: "paid" });
    await expect(markObligationPaid(supabase, { householdId: "h1", obligationId: "b1", paidOn: "2026-11-21" })).rejects.toThrow(/already settled/);
  });
});

describe("marking a bill unpaid", () => {
  it("puts a settled bill back to waiting and takes its month's payment out", async () => {
    const { supabase, writes } = fakeDatabase({ ...oneOff, status: "paid" });
    const result = await markObligationUnpaid(supabase, { householdId: "h1", obligationId: "b1" });
    expect(result.periodLabel).toBe("2026-11");
    expect(writes.map((write) => `${write.table}:${write.op}`)).toEqual(["obligation_history:delete", "obligations:update"]);
    expect(writes[1]!.values).toEqual({ status: "expected" });
  });

  it("refuses a bill that isn't marked paid", async () => {
    const { supabase, writes } = fakeDatabase(oneOff);
    await expect(markObligationUnpaid(supabase, { householdId: "h1", obligationId: "b1" })).rejects.toThrow(/isn't marked as paid/);
    expect(writes).toEqual([]);
  });
});

describe("part payment and how it was paid (11-019)", () => {
  it("records part of a bill and leaves the bill as it was, the rest still due", async () => {
    const { supabase, writes } = fakeDatabase(oneOff);
    const paid = await markObligationPaid(supabase, { householdId: "h1", obligationId: "b1", paidOn: "2026-11-21", amountMinor: 10000, currency: "INR", paidWith: "upi", part: true });
    expect(paid.partial).toEqual({ paidMinor: 10000, leftMinor: 20000 });
    const history = writes.find((write) => write.table === "obligation_history")!;
    expect(history.values).toMatchObject({ amount_minor: 10000, due_minor: 30000, paid_with: "upi" });
    expect(writes.some((write) => write.table === "obligations")).toBe(false);
  });

  it("the rest, marked paid, adds to the part and settles the bill", async () => {
    const part = { amount_minor: 10000, currency: "INR", due_minor: 30000, parts: [{ amountMinor: 10000, paidOn: "2026-11-10", paidWith: "cash", memberId: null }], paid_on: "2026-11-10", paid_with: "cash", owner_member_id: null };
    const { supabase, writes } = fakeDatabase(oneOff, part);
    const paid = await markObligationPaid(supabase, { householdId: "h1", obligationId: "b1", paidOn: "2026-11-21" });
    const history = writes.find((write) => write.table === "obligation_history")!;
    expect(history.values).toMatchObject({ amount_minor: 30000, due_minor: null });
    expect((history.values.parts as unknown[]).length).toBe(2);
    expect(writes.find((write) => write.table === "obligations" && write.op === "update")!.values).toEqual({ status: "paid" });
    expect(paid.previousRow).toMatchObject({ amountMinor: 10000, dueMinor: 30000 });
  });

  it("refuses a part payment on a bill whose amount is not in yet", async () => {
    const { supabase } = fakeDatabase({ ...oneOff, amount_minor: null, currency: null });
    await expect(markObligationPaid(supabase, { householdId: "h1", obligationId: "b1", paidOn: "2026-11-21", amountMinor: 500, currency: "INR", part: true })).rejects.toThrow();
  });
});
