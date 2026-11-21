import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/audit", () => ({ auditChange: vi.fn(async () => undefined) }));
vi.mock("../homesend/changes", () => ({ recordHomeSendChange: vi.fn(async () => ({})), confirmByEvidence: vi.fn(async () => 0) }));
const repo = vi.hoisted(() => ({
  markObligationPaid: vi.fn(async (_client: unknown, input: { obligationId: string; paidOn: string }) => ({ nextDueOn: null, periodLabel: input.paidOn.slice(0, 7), recorded: true, previous: { dueOn: input.paidOn, status: "expected", amountMinor: 150000, currency: "INR" } })),
  undoBillPayment: vi.fn(async () => undefined),
  createObligation: vi.fn(async () => ({ id: "b-new" })),
  cancelObligation: vi.fn(async () => undefined),
  listObligations: vi.fn(async () => [] as unknown[]),
}));
vi.mock("./repository", () => repo);
vi.mock("../finance/repository", () => repo);

import { applyAutopay, dueAutopay, setAutopay, undoAutopayRun, type AutopayBill } from "./autopay";
import { autopayNotices } from "../notifications/notices";
import { settlePaymentProof } from "../homesend/payment-apply";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string } | null };

/** Just enough of the client: filters, insert (unique bill+month on runs), upsert, update, delete, maybeSingle. */
function fakeClient(tables: Record<string, Row[]>, missing: string[] = []) {
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((row: Row) => boolean)[] = [];
    let op: { kind: "select" } | { kind: "insert"; row: Row } | { kind: "update"; patch: Row } | { kind: "delete" } = { kind: "select" };
    const run = (): Result => {
      if (missing.includes(table)) return { data: null, error: { code: "42P01" } };
      if (op.kind === "insert") {
        const row = { id: `${table}-${rows.length + 1}`, state: "checking", created_at: new Date().toISOString(), ...op.row };
        if (table === "obligation_autopay_runs" && rows.some((other) => other.obligation_id === row.obligation_id && other.period_label === row.period_label)) return { data: null, error: { code: "23505" } };
        rows.push(row);
        return { data: [row], error: null };
      }
      const hit = rows.filter((row) => filters.every((filter) => filter(row)));
      if (op.kind === "update") for (const row of hit) Object.assign(row, op.patch);
      if (op.kind === "delete") for (const row of hit) rows.splice(rows.indexOf(row), 1);
      return { data: hit.map((row) => ({ ...row })), error: null };
    };
    const chain = {
      select: () => chain,
      insert: (row: Row) => ((op = { kind: "insert", row }), chain),
      upsert: (row: Row) => ((op = { kind: "insert", row }), chain),
      update: (patch: Row) => ((op = { kind: "update", patch }), chain),
      delete: () => ((op = { kind: "delete" }), chain),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), chain),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), chain),
      gte: (column: string, value: string) => (filters.push((row) => String(row[column] ?? "") >= value), chain),
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        const result = run();
        return Promise.resolve({ data: result.error ? null : ((result.data as Row[])[0] ?? null), error: result.error });
      },
      then: <T>(resolve: (value: Result) => T) => Promise.resolve(run()).then(resolve),
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const H = "h-1";
const bill = (over: Partial<AutopayBill> = {}): AutopayBill => ({ id: "b-1", name: "Airtel", status: "expected", dueOn: "2026-11-21", amountMinor: 150000, currency: "INR", ownerMemberId: "m-1", ...over });

describe("dueAutopay", () => {
  const on = new Set(["b-1"]);
  it("takes an autopay bill whose day has come, with an amount", () => {
    expect(dueAutopay([bill()], "2026-11-21", on, new Set())).toHaveLength(1);
  });
  it("waits for an amount, never guesses one", () => {
    expect(dueAutopay([bill({ amountMinor: null })], "2026-11-21", on, new Set())).toEqual([]);
  });
  it("leaves a skipped month, a future day, a settled bill and a bill not on autopay", () => {
    expect(dueAutopay([bill()], "2026-11-21", on, new Set(), new Map([["b-1", new Set(["2026-11"])]]))).toEqual([]);
    expect(dueAutopay([bill({ dueOn: "2026-11-22" })], "2026-11-21", on, new Set())).toEqual([]);
    expect(dueAutopay([bill({ status: "paid" })], "2026-11-21", on, new Set())).toEqual([]);
    expect(dueAutopay([bill()], "2026-11-21", new Set(), new Set())).toEqual([]);
  });
  it("never marks a month twice", () => {
    expect(dueAutopay([bill()], "2026-11-21", on, new Set(["b-1|2026-11"]))).toEqual([]);
  });
});

function household(): Record<string, Row[]> {
  return {
    households: [{ id: H, timezone: "Asia/Kolkata" }],
    obligation_autopay: [{ obligation_id: "b-1", household_id: H }],
    obligations: [
      { id: "b-1", household_id: H, name: "Airtel", status: "expected", due_on: "2026-11-21", amount_minor: 150000, currency: "INR", responsible_member_id: "m-1", payee: "Airtel" },
      { id: "b-2", household_id: H, name: "Water", status: "expected", due_on: "2026-11-20", amount_minor: null, currency: "INR", responsible_member_id: "m-1", payee: "BWSSB" },
    ],
    obligation_autopay_runs: [],
    obligation_skips: [],
  };
}

describe("applyAutopay", () => {
  beforeEach(() => vi.clearAllMocks());
  const now = new Date("2026-11-21T04:00:00Z");

  it("marks the due bill paid by its owner, Checking, once", async () => {
    const tables = household();
    tables.obligation_autopay!.push({ obligation_id: "b-2", household_id: H });
    const client = fakeClient(tables);
    expect(await applyAutopay(client, H, now)).toEqual({ marked: 1, failed: 0 });
    expect(repo.markObligationPaid).toHaveBeenCalledTimes(1);
    expect(repo.markObligationPaid).toHaveBeenCalledWith(client, expect.objectContaining({ obligationId: "b-1", paidOn: "2026-11-21", amountMinor: 150000, paidByMemberId: "m-1" }));
    expect(tables.obligation_autopay_runs).toEqual([expect.objectContaining({ obligation_id: "b-1", period_label: "2026-11", state: "checking", paid: expect.objectContaining({ periodLabel: "2026-11" }) })]);
    // The second pass the same day finds the month already marked.
    expect(await applyAutopay(client, H, now)).toEqual({ marked: 0, failed: 0 });
    expect(repo.markObligationPaid).toHaveBeenCalledTimes(1);
  });

  it("removes its claim when marking fails, so the next pass tries again", async () => {
    const tables = household();
    repo.markObligationPaid.mockRejectedValueOnce(new Error("down"));
    expect(await applyAutopay(fakeClient(tables), H, now)).toEqual({ marked: 0, failed: 1 });
    expect(tables.obligation_autopay_runs).toEqual([]);
  });

  it("Undo puts the bill back and keeps the month marked as undone", async () => {
    const tables = household();
    const client = fakeClient(tables);
    await applyAutopay(client, H, now);
    const run = tables.obligation_autopay_runs![0]!;
    await undoAutopayRun(client, { householdId: H, runId: run.id as string, memberId: "m-1" });
    expect(repo.undoBillPayment).toHaveBeenCalledWith(client, expect.objectContaining({ householdId: H, obligationId: "b-1", paid: expect.objectContaining({ periodLabel: "2026-11" }) }));
    expect(run.state).toBe("undone");
    expect(await applyAutopay(client, H, now)).toEqual({ marked: 0, failed: 0 });
  });
});

describe("who may undo", () => {
  it("refuses someone who is neither the bill's owner nor an Admin", async () => {
    const tables = household();
    tables.obligation_autopay_runs!.push({ id: "r-1", household_id: H, obligation_id: "b-1", period_label: "2026-11", due_on: "2026-11-21", amount_minor: 150000, currency: "INR", owner_member_id: "m-1", state: "checking", paid: {}, created_at: "x" });
    await expect(undoAutopayRun(fakeClient(tables), { householdId: H, runId: "r-1", memberId: "m-2", isAdmin: false })).rejects.toThrow("owner or an Admin");
    expect(tables.obligation_autopay_runs![0]!.state).toBe("checking");
  });
});

describe("setAutopay", () => {
  it("says it isn't switched on yet before the migration", async () => {
    await expect(setAutopay(fakeClient(household(), ["obligation_autopay"]), { householdId: H, obligationId: "b-1", on: true, memberId: "m-a" })).rejects.toThrow("isn't switched on yet");
  });
  it("refuses a bill from another household", async () => {
    await expect(setAutopay(fakeClient(household()), { householdId: "h-2", obligationId: "b-1", on: true, memberId: "m-a" })).rejects.toThrow("no longer here");
  });
  it("turns it off", async () => {
    const tables = household();
    await setAutopay(fakeClient(tables), { householdId: H, obligationId: "b-1", on: false, memberId: "m-a" });
    expect(tables.obligation_autopay).toEqual([]);
  });
});

describe("a payment message about an autopaid bill", () => {
  beforeEach(() => vi.clearAllMocks());
  const now = new Date("2026-11-22T04:00:00Z");

  function withProof(amount: number) {
    const tables = household();
    tables.obligation_autopay_runs!.push({ id: "r-1", household_id: H, obligation_id: "b-1", period_label: "2026-11", due_on: "2026-11-21", amount_minor: 150000, currency: "INR", owner_member_id: "m-1", state: "checking", paid: {}, created_at: "2026-11-21T04:00:00Z" });
    // The bill moved on to December once marked.
    tables.obligations![0]!.due_on = "2026-12-21";
    tables.home_send_items = [{ id: "i-1", household_id: H, status: "classified", updated_at: "t", created_by_member_id: "m-1", understanding: { payment: { amount, currency: "INR", payee: "Airtel", paidOn: "2026-11-21", method: "bank" } } }];
    repo.listObligations.mockResolvedValueOnce([
      { id: "b-1", name: "Airtel", payee: "Airtel", amountMinor: 150000, currency: "INR", dueOn: "2026-12-21", status: "expected" },
    ]);
    return tables;
  }

  it("confirms the run when the amount agrees, and records nothing else", async () => {
    const tables = withProof(1500);
    expect(await settlePaymentProof(fakeClient(tables), H, "i-1", now)).toBe("paid");
    expect(tables.obligation_autopay_runs![0]!.state).toBe("confirmed");
    expect(repo.markObligationPaid).not.toHaveBeenCalled();
    expect(repo.createObligation).not.toHaveBeenCalled();
    expect(tables.home_send_items![0]!.routed_id).toBe("b-1");
  });

  it("flags the run when the amount disagrees, never changing the payment", async () => {
    const tables = withProof(1750);
    expect(await settlePaymentProof(fakeClient(tables), H, "i-1", now)).toBe("conflict");
    expect(tables.obligation_autopay_runs![0]!.state).toBe("flagged");
    expect(repo.undoBillPayment).not.toHaveBeenCalled();
    expect(repo.markObligationPaid).toHaveBeenCalledTimes(1); // only the separate "Paid to Airtel" entry the nightly check asks about
    expect(repo.markObligationPaid).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ obligationId: "b-new" }));
    expect((tables.home_send_items![0]!.understanding as { payment: Row }).payment).toMatchObject({ outcome: "conflict", billId: "b-1", billName: "Airtel" });
  });
});

describe("autopayNotices", () => {
  const directory = {
    members: new Map([
      ["m-1", { active: true, hasAccount: true, memberType: "adult" }],
      ["m-a", { active: true, hasAccount: true, memberType: "adult" }],
    ]),
    admins: ["m-a"],
  } as never;
  const row = { id: "r-1", obligation_id: "b-1", amount_minor: 150000, currency: "INR", owner_member_id: "m-1", state: "checking", created_at: "2026-11-21T04:00:00Z", bill_name: "Airtel" };

  it("tells the bill's owner, with the amount and a way to undo", () => {
    const [notice] = autopayNotices([row], directory, new Date("2026-11-21T05:00:00Z"));
    expect(notice).toMatchObject({ sourceType: "autopay", recipientMemberId: "m-1", category: "bills", action: { action: "open", target: "/bills?autopay=r-1" } });
    expect(notice!.body).toMatchObject({ key: "reminder.autopay.body", params: { name: "Airtel", amount: { money: 1500, currency: "INR" } } });
  });
  it("stops once confirmed or undone, or after three days", () => {
    expect(autopayNotices([{ ...row, state: "undone" }], directory, new Date("2026-11-21T05:00:00Z"))).toEqual([]);
    expect(autopayNotices([row], directory, new Date("2026-11-25T05:00:00Z"))).toEqual([]);
  });
});
