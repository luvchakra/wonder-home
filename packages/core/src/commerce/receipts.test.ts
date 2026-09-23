import { describe, expect, it } from "vitest";

import { currencyCode, historyFrom, itemWords, matchConsumable, unitCostMinor } from "./receipts";

const tracked = [
  { id: "milk", name: "Milk" },
  { id: "eggs", name: "Eggs" },
  { id: "bread", name: "Brown bread" },
  { id: "rice", name: "Basmati rice" },
];

describe("a receipt line is matched to what the household tracks (09-009)", () => {
  it("reads the thing, not the pack", () => {
    expect(itemWords("Amul Toned Milk 1L")).toEqual(["amul", "toned", "milk"]);
    expect(itemWords("EGGS x12")).toEqual(["egg"]);
    expect(itemWords("Tomatoes 500g loose")).toEqual(["tomato"]);
  });

  it.each([
    ["Eggs", "eggs", "exact"],
    ["EGGS 12 PCS", "eggs", "exact"],
    ["Amul Toned Milk 1L", "milk", "contains"],
    ["Brown Bread 400g", "bread", "exact"],
    ["India Gate Basmati Rice 5kg", "rice", "contains"],
  ])("%s → %s (%s)", (line, id, how) => {
    expect(matchConsumable(line, tracked)).toMatchObject({ consumableId: id, how });
  });

  it("something new, or two equally good fits, is left for the person", () => {
    expect(matchConsumable("Dishwash liquid 500ml", tracked)).toBeNull();
    expect(matchConsumable("Milk bread", tracked)).toBeNull();
    expect(matchConsumable("Whole milk", [{ id: "a", name: "Milk" }, { id: "b", name: "Milk" }])).toBeNull();
    expect(matchConsumable("1L", tracked)).toBeNull();
  });

  it("the longer tracked name wins when both fit", () => {
    expect(matchConsumable("Brown bread", [{ id: "bread", name: "Bread" }, { id: "brown", name: "Brown bread" }])).toMatchObject({ consumableId: "brown" });
  });
});

describe("what the history says after a purchase is recorded or undone", () => {
  const unknown = { daysPerUnit: null, evidenceBasis: null } as const;

  it("the last purchase is the latest day, several lines on one day are one shop", () => {
    const history = historyFrom([{ purchasedOn: "2026-09-10", quantity: 2 }, { purchasedOn: "2026-09-20", quantity: 1 }, { purchasedOn: "2026-09-20", quantity: 1 }], unknown);
    expect(history).toMatchObject({ lastPurchasedOn: "2026-09-20", lastPurchasedQuantity: 2 });
  });

  it("three purchases are enough to learn a rate, and it is labelled as coming from purchases", () => {
    const history = historyFrom(
      [
        { purchasedOn: "2026-09-01", quantity: 1 },
        { purchasedOn: "2026-09-04", quantity: 1 },
        { purchasedOn: "2026-09-07", quantity: 1 },
      ],
      unknown,
    );
    expect(history).toMatchObject({ daysPerUnit: 3, evidenceBasis: "purchase_history" });
  });

  it("fewer than three says nothing about the rate", () => {
    expect(historyFrom([{ purchasedOn: "2026-09-01", quantity: 1 }, { purchasedOn: "2026-09-04", quantity: 1 }], unknown)).toMatchObject({ daysPerUnit: null, evidenceBasis: null });
  });

  it("a rate the household stated is theirs, and stays", () => {
    const purchases = [
      { purchasedOn: "2026-09-01", quantity: 1 },
      { purchasedOn: "2026-09-04", quantity: 1 },
      { purchasedOn: "2026-09-07", quantity: 1 },
    ];
    expect(historyFrom(purchases, { daysPerUnit: 5, evidenceBasis: "member_stated" })).toMatchObject({ daysPerUnit: 5, evidenceBasis: "member_stated", lastPurchasedOn: "2026-09-07" });
  });

  it("undoing the purchase a rate rested on takes the rate away again", () => {
    expect(historyFrom([{ purchasedOn: "2026-09-01", quantity: 1 }], { daysPerUnit: 3, evidenceBasis: "purchase_history" })).toMatchObject({ daysPerUnit: null, evidenceBasis: null, lastPurchasedOn: "2026-09-01" });
    expect(historyFrom([], { daysPerUnit: 3, evidenceBasis: "purchase_history" })).toEqual({ lastPurchasedOn: null, lastPurchasedQuantity: null, daysPerUnit: null, evidenceBasis: null });
  });
});

describe("money on a receipt", () => {
  it("reads the currency, or says it cannot", () => {
    expect(currencyCode("₹")).toBe("INR");
    expect(currencyCode("Rs.")).toBe("INR");
    expect(currencyCode("usd")).toBe("USD");
    expect(currencyCode("$")).toBeNull();
    expect(currencyCode(null)).toBeNull();
  });

  it("a unit cost is kept only with a currency, in minor units at that one boundary", () => {
    expect(unitCostMinor(120, 2, "INR")).toBe(6000);
    expect(unitCostMinor(42.5, 1, "INR")).toBe(4250);
    expect(unitCostMinor(120, 2, null)).toBeNull();
    expect(unitCostMinor(null, 2, "INR")).toBeNull();
  });
});
