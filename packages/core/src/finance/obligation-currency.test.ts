import { describe, expect, it, vi } from "vitest";

vi.mock("../homebrain/context-store", () => ({ markContextStale: vi.fn(async () => undefined) }));

import { createObligation, markObligationPaid, updateObligation } from "./repository";

/**
 * The database holds a bill's amount and currency together
 * (obligations_amount_has_currency): both set or both empty. Marking a
 * monthly bill paid once kept the currency while clearing next month's
 * amount, and every recurring bill with an amount failed (the owner,
 * 2026-10-23, reference notifications-41g7q9).
 */

type Write = { table: string; op: string; values: Record<string, unknown> };

function fakeDatabase(bill: Record<string, unknown>) {
  const writes: Write[] = [];
  const builder = (table: string) => {
    let op = "select";
    let values: Record<string, unknown> = {};
    const result = () => {
      if (op !== "select") writes.push({ table, op, values });
      if (op === "insert") return { data: { id: "new-bill" }, error: null };
      if (table === "obligations" && op === "select") return { data: bill, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const name of ["eq", "gte", "lte", "in", "limit", "order", "select", "is", "neq"]) chain[name] = () => chain;
    chain.insert = (row: Record<string, unknown>) => ((op = "insert"), (values = row), chain);
    chain.update = (row: Record<string, unknown>) => ((op = "update"), (values = row), chain);
    chain.upsert = (row: Record<string, unknown>) => ((op = "upsert"), (values = row), chain);
    chain.delete = () => ((op = "delete"), chain);
    chain.maybeSingle = async () => result();
    chain.single = async () => result();
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  const supabase = { from: (table: string) => builder(table), rpc: async () => ({ data: null, error: null }) };
  return { supabase: supabase as never, writes };
}

const paired = (values: Record<string, unknown>) => (values.amount_minor ?? null) === null === ((values.currency ?? null) === null);

describe("a bill's amount and currency stay together", () => {
  it("moves a paid monthly bill on with neither amount nor currency until next month's is known", async () => {
    const { supabase, writes } = fakeDatabase({ id: "b1", status: "expected", due_on: "2026-10-24", recurrence: "monthly", amount_minor: 310000, currency: "INR", payee: null, kind: "utility", responsible_member_id: null });
    const paid = await markObligationPaid(supabase, { householdId: "h1", obligationId: "b1", paidOn: "2026-10-23" });
    expect(paid.nextDueOn).toBe("2026-11-24");
    const update = writes.find((write) => write.table === "obligations" && write.op === "update")!;
    expect(update.values).toMatchObject({ due_on: "2026-11-24", status: "expected", amount_minor: null, currency: null });
    expect(paired(update.values)).toBe(true);
  });

  it("never writes a currency without an amount when a bill is added or changed", async () => {
    const { supabase, writes } = fakeDatabase({});
    await createObligation(supabase, { householdId: "h1", name: "Water", kind: "utility", amountMinor: null, currency: "INR" });
    await updateObligation(supabase, { id: "b1", householdId: "h1", amountMinor: null });
    for (const write of writes.filter((write) => write.table === "obligations")) expect(paired(write.values)).toBe(true);
  });
});
