import { describe, expect, it } from "vitest";

import { billShape, eventShape, groceryShape } from "./record-types";

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
