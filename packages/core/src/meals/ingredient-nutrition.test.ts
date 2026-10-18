import { describe, expect, it } from "vitest";

import type { CatalogEntry } from "../commerce/catalog";
import { ingredientLinesFrom } from "./ingredient-lines";
import { nutritionPerServing } from "./ingredient-nutrition";

function entry(nutrients: CatalogEntry["nutrients"], extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: "c", kind: "item", common: true, name: "x", brand: null, category: "staples", subcategory: null, pack: null, unit: "g",
    ladder: { unit: "g", steps: [] } as unknown as CatalogEntry["ladder"], imageUrl: null, imageCredit: null, nutrients, nutrientBasis: "100g",
    source: "wonderhome", licence: "", attribution: "", sourceUrl: null, ifct: null, ...extra,
  };
}

describe("an ingredient row's pick (25-017)", () => {
  it("is carried only in the two shapes the form makes", () => {
    const lines = ingredientLinesFrom({
      names: ["Rajma", "Onion", "Salt"],
      quantities: ["500", "2", ""],
      units: ["g", "pcs", "g"],
      refs: ["catalog:11111111-1111-4111-8111-111111111111", "item:22222222-2222-4222-8222-222222222222", "javascript:alert(1)"],
    });
    expect(lines.map((line) => line.ref ?? null)).toEqual(["catalog:11111111-1111-4111-8111-111111111111", "item:22222222-2222-4222-8222-222222222222", null]);
  });
});

describe("nutrients per serving, added up from the ingredients (25-017)", () => {
  it("is arithmetic: per 100 g × grams ÷ 100, summed, ÷ servings", () => {
    const entries = new Map([
      ["rajma", entry({ energy_kcal: 333, protein_g: 24, carbohydrate_g: 60, fat_g: 1 })],
      ["rice", entry({ energy_kcal: 360, protein_g: 7, carbohydrate_g: 79, fat_g: 0.5 })],
    ]);
    const result = nutritionPerServing(
      [
        { name: "Rajma", quantity: 500, unit: "g", consumableId: "rajma" },
        { name: "Rice", quantity: 0.4, unit: "kg", consumableId: "rice" },
        { name: "Onion", quantity: 2, unit: "pcs", consumableId: null },
      ],
      entries,
      4,
    );
    // (333×5 + 360×4) ÷ 4 = (1665 + 1440) ÷ 4 = 776.25
    // Fat: (1×5 + 0.5×4) ÷ 4 = 1.75, kept whole as a recipe keeps it: 2.
    expect(result).toEqual({ caloriesPerServing: 776, proteinGrams: 37, carbsGrams: 154, fatGrams: 2, counted: 2, total: 3 });
  });

  it("leaves out what cannot be weighed, and says nothing when nothing could be", () => {
    const entries = new Map([["egg", entry({ energy_kcal: 155 })]]);
    expect(nutritionPerServing([{ name: "Eggs", quantity: 6, unit: "pcs", consumableId: "egg" }], entries, 2)).toBeNull();
    expect(nutritionPerServing([{ name: "Salt", quantity: 1, unit: "unit", consumableId: "egg" }], entries, 2)).toBeNull();
  });

  it("prefers the Indian Food Composition Tables where an item has them", () => {
    const entries = new Map([["dal", entry({ energy_kcal: 999 }, { ifct: { code: "A1", name: "Dal", match: "exact", note: null, nutrients: { energy_kcal: 340 }, energyComputed: false } })]]);
    expect(nutritionPerServing([{ name: "Dal", quantity: 100, unit: "g", consumableId: "dal" }], entries, 1)?.caloriesPerServing).toBe(340);
  });
});
