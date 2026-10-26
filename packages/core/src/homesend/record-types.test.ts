import { describe, expect, it } from "vitest";

import { billShape, eventShape, groceryAmount, groceryShape } from "./record-types";

describe("eventShape", () => {
  it("files an event under the calendar's own kind and category", () => {
    expect(eventShape({ title: "Riya's 8th birthday party" })).toEqual({ kind: "birthday", category: "family" });
    expect(eventShape({ title: "Blood Test Camp at Splendora CHS" })).toEqual({ kind: "appointment", category: "health" });
    expect(eventShape({ title: "Cousin's wedding reception" })).toEqual({ kind: "special_occasion", category: "family" });
    expect(eventShape({ title: "Goa trip" })).toEqual({ kind: "travel", category: "family" });
    expect(eventShape({ title: "Society AGM" })).toEqual({ kind: "gathering", category: "household" });
    expect(eventShape({ title: "PTM for Asmi" })).toEqual({ kind: "school_event", category: "school" });
  });

  it("reads the notes too, and is a family gathering when nothing says otherwise", () => {
    expect(eventShape({ title: "Saturday at the clubhouse", notes: "1. Free eye check-up for seniors" })).toEqual({ kind: "appointment", category: "health" });
    expect(eventShape({ title: "Get-together at the Mehtas'" })).toEqual({ kind: "gathering", category: "family" });
  });
});

describe("billShape", () => {
  it("gives a bill the type and cadence the Bills screen's picker would", () => {
    expect(billShape({ title: "Electricity bill", payee: "Tata Power" })).toMatchObject({ billType: "electricity", recurrence: "monthly", kind: "utility" });
  });

  it("keeps the kind the person picked, and leaves the type empty when nothing fits", () => {
    expect(billShape({ title: "Electricity bill", kind: "other" }).kind).toBe("other");
    expect(billShape({ title: "Karate term fee" })).toMatchObject({ billType: "school_fee" });
    expect(billShape({ title: "Gift fund for Mrs Rao" })).toEqual({ kind: "other", billType: null, recurrence: null });
  });
});

describe("groceryShape", () => {
  it("counts a grocery in a unit Groceries knows, with an amount to buy", () => {
    expect(groceryShape({ title: " Basmati rice ", quantity: 5, unit: "Kg" })).toEqual({ name: "Basmati rice", unit: "kg", toBuy: 5 });
  });

  it("buys one in pieces when no amount or unit was read", () => {
    expect(groceryShape({ title: "Milk", quantity: "", unit: null })).toEqual({ name: "Milk", unit: "pcs", toBuy: 1 });
    expect(groceryShape({ title: "Eggs", quantity: 0, unit: " " })).toEqual({ name: "Eggs", unit: "pcs", toBuy: 1 });
  });
});

// The owner, 2026-10-26: a number alone is the item's practical amount (25-037).
describe("groceryAmount", () => {
  it("reads a number alone by the item's practical unit, never the one it is stored in", () => {
    expect(groceryAmount({ quantity: 2, unit: null }, { name: "Milk", unit: "ml" })).toEqual({ quantity: 2000, unit: "ml" });
    expect(groceryAmount({ quantity: 2, unit: "" }, { name: "Eggs", unit: "dozen" })).toEqual({ quantity: 2, unit: "pcs" });
    expect(groceryAmount({ quantity: "2", unit: null }, { name: "Rice", unit: "kg" })).toEqual({ quantity: 2000, unit: "g" });
    expect(groceryAmount({ quantity: 1, unit: null }, { name: "Coconut oil", unit: "l" })).toEqual({ quantity: 1000, unit: "ml" });
  });

  it("an amount said with its unit wins", () => {
    expect(groceryAmount({ quantity: 2, unit: "dozen" }, { name: "Eggs", unit: "pcs" })).toEqual({ quantity: 24, unit: "pcs" });
    expect(groceryAmount({ quantity: 500, unit: "ml" }, { name: "Milk", unit: "l" })).toEqual({ quantity: 500, unit: "ml" });
  });

  it("a number the rule would ask about takes what it would suggest", () => {
    expect(groceryAmount({ quantity: 2000, unit: null }, { name: "Milk", unit: "ml" })).toEqual({ quantity: 2000, unit: "ml" });
  });
});
