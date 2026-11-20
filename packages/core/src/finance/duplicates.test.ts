import { describe, expect, it } from "vitest";

import { billCategory, planTidy, type TidyBill } from "./duplicates";

/** The owner's bills screen on 2026-11-20, row for row. */
const bill = (id: string, name: string, dueOn: string | null, amountMinor: number | null, extra: Partial<TidyBill> = {}): TidyBill => ({
  id,
  name,
  payee: null,
  amountMinor,
  currency: amountMinor === null ? null : "INR",
  dueOn,
  status: "expected",
  updatedAt: "2026-11-01T00:00:00Z",
  checking: false,
  fromSource: false,
  ...extra,
});

const SCREEN: TidyBill[] = [
  bill("1", "Electricity", "2026-10-01", 250000, { billType: "electricity" }),
  bill("2", "Piped gas", "2026-10-14", 70000),
  bill("3", "Annual Day costume contribution", "2026-11-02", 30000),
  bill("4", "BESCOM electricity bill for October", "2026-11-05", 214000, { checking: true, fromSource: true, updatedAt: "2026-11-03T08:00:00Z" }),
  bill("5", "Electricity bill", "2026-11-05", 234000, { checking: true, fromSource: true, updatedAt: "2026-11-03T08:00:01Z" }),
  bill("6", "Airtel Xstream Fiber bill (1–31 Oct)", "2026-11-10", 117882, { checking: true, fromSource: true }),
  bill("7", "Electricity", "2026-11-24", null, { billType: "electricity" }),
  bill("8", "Broadband", null, 115000),
];

describe("which kind of bill a row is", () => {
  it("reads the kind from the typical bill, the words, or a payee the catalogue knows", () => {
    expect(billCategory({ name: "BESCOM electricity bill for October", payee: null }).key).toBe("electricity");
    expect(billCategory({ name: "Airtel Xstream Fiber bill (1–31 Oct)", payee: null }).key).toBe("broadband");
    expect(billCategory({ name: "Broadband", payee: null }).key).toBe("broadband");
    expect(billCategory({ name: "Piped gas", payee: null }).key).toBe("piped_gas");
    expect(billCategory({ name: "Monthly dues", payee: "BESCOM" }).key).toBe("electricity");
    expect(billCategory({ name: "Annual Day costume contribution", payee: null })).toEqual({ key: "annual day costume contribution", typical: false });
  });
});

describe("Tidy up on the owner's screen (2026-11-20)", () => {
  const plan = planTidy(SCREEN);

  it("finds exactly one likely duplicate: the two electricity bills due 5 Nov", () => {
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0]).toMatchObject({ category: { key: "electricity" }, ids: ["4", "5"], sameDay: true });
  });

  it("suggests one to keep but says why, and removes nothing itself", () => {
    const [group] = plan.duplicates;
    // Both Checking, both from a document, both with an amount: the newer reading is suggested.
    expect(group!.keepId).toBe("5");
    expect(group!.keepBecause).toBe("newest");
  });

  it("relates the recurring Electricity rows (1 Oct and 24 Nov) without calling different months duplicates", () => {
    const electricity = plan.series.find((series) => series.category.key === "electricity");
    expect(electricity?.ids).toEqual(["1", "4", "5", "7"]);
    for (const group of plan.duplicates) {
      expect(group.ids).not.toContain("1");
      expect(group.ids).not.toContain("7");
    }
  });

  it("never calls a bill with no due date a duplicate, though it is listed with its kind", () => {
    expect(plan.duplicates.flatMap((group) => group.ids)).not.toContain("8");
    expect(plan.series.find((series) => series.category.key === "broadband")?.ids).toEqual(["6", "8"]);
  });

  it("prefers a confirmed bill over one still Checking, and a read one over a placeholder", () => {
    const confirmed = planTidy([
      bill("a", "Electricity", "2026-11-05", 214000, { checking: true, fromSource: true }),
      bill("b", "Electricity", "2026-11-06", 214000),
    ]);
    expect(confirmed.duplicates[0]).toMatchObject({ keepId: "b", keepBecause: "confirmed", sameDay: false });
    const placeholder = planTidy([
      bill("a", "Electricity", "2026-11-24", null),
      bill("b", "BESCOM bill", "2026-11-22", 230000, { fromSource: true }),
    ]);
    expect(placeholder.duplicates[0]).toMatchObject({ ids: ["b", "a"], keepId: "b", keepBecause: "source" });
  });

  it("leaves paid and removed bills out", () => {
    const plan = planTidy([bill("a", "Electricity", "2026-11-05", 1), bill("b", "Electricity", "2026-11-05", 1, { status: "cancelled" }), bill("c", "Electricity", "2026-11-05", 1, { status: "paid" })]);
    expect(plan.duplicates).toEqual([]);
  });
});
