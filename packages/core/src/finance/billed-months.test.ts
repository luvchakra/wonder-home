import { describe, expect, it } from "vitest";

import { billedMonths } from "./billed-months";

describe("billedMonths", () => {
  it("charts given months and the open bill straight away, with no payment recorded (the piped gas case)", () => {
    const months = billedMonths({
      paid: [],
      given: new Map([["gas", [
        { periodLabel: "2026-07", amountMinor: 50000, currency: "INR" },
        { periodLabel: "2026-08", amountMinor: 80000, currency: "INR" },
        { periodLabel: "2026-09", amountMinor: 50000, currency: "INR" },
      ]]]),
      bills: [{ id: "gas", status: "received", dueOn: "2026-10-14", amountMinor: 70000, currency: "INR", payee: "Mahanagar Gas (MGL)" }],
      thisMonth: "2026-10",
    });
    expect(months.map((month) => [month.periodLabel, month.amountMinor, month.from])).toEqual([
      ["2026-07", 50000, "given"],
      ["2026-08", 80000, "given"],
      ["2026-09", 50000, "given"],
      ["2026-10", 70000, "bill"],
    ]);
  });

  it("counts a month once: what was paid wins over a given amount and the bill's own", () => {
    const months = billedMonths({
      paid: [{ obligationId: "power", periodLabel: "2026-10", amountMinor: 240000, currency: "INR" }],
      given: new Map([["power", [{ periodLabel: "2026-10", amountMinor: 999, currency: "INR" }]]]),
      bills: [{ id: "power", status: "received", dueOn: "2026-10-01", amountMinor: 250000, currency: "INR" }],
      thisMonth: "2026-10",
    });
    expect(months).toEqual([{ obligationId: "power", periodLabel: "2026-10", amountMinor: 240000, currency: "INR", from: "paid", payee: null }]);
  });

  it("leaves out months ahead, settled or cancelled bills' own amounts, and empty amounts", () => {
    const months = billedMonths({
      paid: [],
      given: new Map([["rent", [{ periodLabel: "2026-11", amountMinor: 3000000, currency: "INR" }]]]),
      bills: [
        { id: "rent", status: "received", dueOn: "2026-11-05", amountMinor: 3000000, currency: "INR" },
        { id: "old", status: "cancelled", dueOn: "2026-10-05", amountMinor: 1000, currency: "INR" },
        { id: "fees", status: "received", dueOn: "2026-10-05", amountMinor: null, currency: "INR" },
      ],
      thisMonth: "2026-10",
    });
    expect(months).toEqual([]);
  });
});
