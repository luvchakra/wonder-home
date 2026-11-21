import { describe, expect, it } from "vitest";

import { applyPayment, isPartRow, remainingMinor } from "./part-payment";

const pay = (amountMinor: number, part: boolean, billAmountMinor: number | null = 120000) => ({ amountMinor, billAmountMinor, part, paidOn: "2026-11-21", paidWith: "upi" as const, memberId: "m1" });

describe("part payment (11-019)", () => {
  it("keeps the rest due when only part is paid", () => {
    const applied = applyPayment(null, pay(50000, true));
    expect(applied).toMatchObject({ amountMinor: 50000, dueMinor: 120000, settled: false });
    expect(applied.parts).toHaveLength(1);
    expect(remainingMinor(120000, { amount_minor: applied.amountMinor, due_minor: applied.dueMinor })).toBe(70000);
  });

  it("adds a second part to the first, and the last one settles the month", () => {
    const first = applyPayment(null, pay(50000, true));
    const row = { amount_minor: first.amountMinor, due_minor: first.dueMinor, parts: first.parts };
    const second = applyPayment(row, pay(30000, true));
    expect(second).toMatchObject({ amountMinor: 80000, dueMinor: 120000, settled: false });
    const last = applyPayment({ amount_minor: second.amountMinor, due_minor: second.dueMinor, parts: second.parts }, pay(40000, false));
    expect(last).toMatchObject({ amountMinor: 120000, dueMinor: null, settled: true });
    expect(last.parts.map((p) => p.amountMinor)).toEqual([50000, 30000, 40000]);
  });

  it("never decides 'part' from a smaller amount alone: the bill just came to less", () => {
    expect(applyPayment(null, pay(90000, false))).toMatchObject({ amountMinor: 90000, dueMinor: null, settled: true, parts: [] });
  });

  it("a part that covers the whole settles it", () => {
    expect(applyPayment(null, pay(120000, true))).toMatchObject({ settled: true, dueMinor: null });
  });

  it("needs the bill's amount to know what is left", () => {
    expect(() => applyPayment(null, pay(5000, true, null))).toThrow();
  });

  it("reads rows from before the migration as paid in full", () => {
    expect(isPartRow({ amount_minor: 100 })).toBe(false);
    expect(remainingMinor(500, { amount_minor: 100 })).toBe(500);
  });
});
