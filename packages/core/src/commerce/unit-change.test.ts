import { describe, expect, it } from "vitest";

import { planUnitChange } from "./unit-change";

describe("changing how an item is counted (25-013)", () => {
  const item = { unit: "pcs", step: 2, catalog: null, onList: true };

  it("a unit that converts carries the household's own step across", () => {
    expect(planUnitChange({ unit: "g", step: 250, catalog: null, onList: true }, "kg")).toEqual({ unit: "kg", baseUnit: "g", step: 0.25, listQuantity: null, converts: true });
    expect(planUnitChange({ unit: "l", step: null, catalog: null, onList: false }, "ml")).toMatchObject({ unit: "ml", step: null, converts: true });
  });

  it("pieces to grams starts the list again at a natural amount and drops the old step", () => {
    const plan = planUnitChange(item, "grams");
    expect(plan).toMatchObject({ unit: "g", baseUnit: "g", step: null, converts: false });
    expect(plan!.listQuantity).toBeGreaterThan(0);
    expect(planUnitChange({ ...item, onList: false }, "g")!.listQuantity).toBeNull();
  });

  it("the catalog's pack is the usual buy", () => {
    expect(planUnitChange({ ...item, catalog: { ladder: { unit: "g", sizes: [250, 500, 1000] }, pack: { quantity: 500, unit: "g" } } }, "g")!.listQuantity).toBe(500);
  });

  it("the same unit, or no unit, is no change", () => {
    expect(planUnitChange(item, "pieces")).toBeNull();
    expect(planUnitChange(item, "  ")).toBeNull();
  });

  it("a household's own word is a unit of its own", () => {
    expect(planUnitChange(item, "Sachet")).toMatchObject({ unit: "sachet", baseUnit: "sachet", converts: false });
  });
});
