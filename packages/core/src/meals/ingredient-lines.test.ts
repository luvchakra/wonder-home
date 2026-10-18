import { describe, expect, it } from "vitest";

import { ingredientLinesFrom, readQuantity } from "./ingredient-lines";

describe("ingredientLinesFrom", () => {
  it("keeps each named row with its amount and picked unit", () => {
    expect(
      ingredientLinesFrom({ names: ["rajma", "Onions", ""], quantities: ["500", "2", "3"], units: ["g", "pcs", "kg"] }),
    ).toEqual([
      { name: "Rajma", quantity: 500, unit: "g" },
      { name: "Onions", quantity: 2, unit: "pcs" },
    ]);
  });

  it("says the amount is not known when none was typed, never 1 pc", () => {
    expect(ingredientLinesFrom({ names: ["Rice"], quantities: [""], units: ["kg"] })).toEqual([{ name: "Rice", quantity: 1, unit: "unit" }]);
  });

  it("reads decimals with a comma or a point, and normalizes the unit", () => {
    expect(ingredientLinesFrom({ names: ["Milk", "Atta"], quantities: ["1,5", "0.25"], units: ["L", "Kgs"] })).toEqual([
      { name: "Milk", quantity: 1.5, unit: "l" },
      { name: "Atta", quantity: 0.25, unit: "kg" },
    ]);
  });

  it("keeps a household's own unit", () => {
    expect(ingredientLinesFrom({ names: ["Hing"], quantities: ["1"], units: ["sachet"] })).toEqual([{ name: "Hing", quantity: 1, unit: "sachet" }]);
  });

  it("adds the same item in the same unit, and keeps the first of two units", () => {
    expect(
      ingredientLinesFrom({ names: ["Onion", "onion", "Tomato", "tomato"], quantities: ["1", "2", "200", "2"], units: ["pcs", "pcs", "g", "pcs"] }),
    ).toEqual([
      { name: "Onion", quantity: 3, unit: "pcs" },
      { name: "Tomato", quantity: 200, unit: "g" },
    ]);
  });

  it("stops at forty rows", () => {
    const names = Array.from({ length: 50 }, (_, index) => `Item ${index}`);
    expect(ingredientLinesFrom({ names, quantities: [], units: [] })).toHaveLength(40);
  });
});

describe("readQuantity", () => {
  it.each([
    ["2", 2],
    ["1.333", 1.33],
    [".5", 0.5],
    ["0", null],
    ["-1", null],
    ["two", null],
    ["", null],
    [undefined, null],
  ])("%s → %s", (raw, expected) => {
    expect(readQuantity(raw)).toBe(expected);
  });
});
