import { describe, expect, it } from "vitest";

import { readItemAmount, readMakeThat } from "./quantity";

describe("reading an amount out of what was said", () => {
  it.each([
    ["6 eggs", "eggs", { quantity: 6, unit: null, more: false }],
    ["6 more eggs", "eggs", { quantity: 6, unit: null, more: true }],
    ["6 more", "", { quantity: 6, unit: null, more: true }],
    ["6", "", { quantity: 6, unit: null, more: false }],
    ["2 kg potatoes", "potatoes", { quantity: 2, unit: "kg", more: false }],
    ["1 litre milk", "milk", { quantity: 1, unit: "l", more: false }],
    ["one litre", "", { quantity: 1, unit: "l", more: false }],
    ["500 grams of rice", "rice", { quantity: 500, unit: "g", more: false }],
    ["1.5kg rice", "rice", { quantity: 1.5, unit: "kg", more: false }],
    ["half a kilo of tomatoes", "tomatoes", { quantity: 0.5, unit: "kg", more: false }],
    ["a dozen eggs", "eggs", { quantity: 1, unit: "dozen", more: false }],
    ["two bunches of coriander", "coriander", { quantity: 2, unit: "bunch", more: false }],
    ["10 eggs in the fridge", "eggs", { quantity: 10, unit: null, more: false }],
  ])("%s", (phrase, item, amount) => {
    expect(readItemAmount(phrase)).toEqual({ item, amount });
  });

  it("leaves an item with no amount alone", () => {
    expect(readItemAmount("milk")).toEqual({ item: "milk", amount: null });
    expect(readItemAmount("a milk")).toEqual({ item: "milk", amount: null });
    expect(readItemAmount("almond milk")).toEqual({ item: "almond milk", amount: null });
    expect(readItemAmount("7up")).toEqual({ item: "7up", amount: null });
  });

  it("reads 'make that' as a new total", () => {
    expect(readMakeThat("make that 2 litres")).toEqual({ quantity: 2, unit: "l", more: false });
    expect(readMakeThat("Actually, make it 500 grams.")).toEqual({ quantity: 500, unit: "g", more: false });
    expect(readMakeThat("make that Friday")).toBeNull();
  });
});
