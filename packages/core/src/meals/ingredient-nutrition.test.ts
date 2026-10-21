import { describe, expect, it } from "vitest";

import type { CatalogEntry } from "../commerce/catalog";
import { ingredientLinesFrom } from "./ingredient-lines";
import { nutritionPerServing } from "./ingredient-nutrition";

function entry(nutrients: CatalogEntry["nutrients"], extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: "c", kind: "item", common: true, name: "x", brand: null, category: "staples", subcategory: null, pack: null, unit: "g",
    ladder: { unit: "g", steps: [] } as unknown as CatalogEntry["ladder"], imageUrl: null, imageCredit: null, nutrients, nutrientBasis: "100g",
    source: "wonderhome", licence: "", attribution: "", sourceUrl: null, ifct: null, usda: null, ...extra,
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
    expect(result).toEqual({ caloriesPerServing: 776, proteinGrams: 37, carbsGrams: 154, fatGrams: 2, counted: 2, total: 3, missing: ["Onion"] });
  });

  it("leaves out what cannot be weighed, and says nothing when nothing could be", () => {
    const entries = new Map([["egg", entry({ energy_kcal: 155 })]]);
    expect(nutritionPerServing([{ name: "Eggs", quantity: 6, unit: "pcs", consumableId: "egg" }], entries, 2)).toBeNull();
    expect(nutritionPerServing([{ name: "Salt", quantity: 1, unit: "unit", consumableId: "egg" }], entries, 2)).toBeNull();
  });

  it("weighs a liquid kept per 100 g at its density: oil at 0.92 g a ml", () => {
    const entries = new Map([
      ["oil", entry({ energy_kcal: 900, fat_g: 100 }, { category: "Oils & ghee", ifct: { code: "T012", name: "Oil", match: "exact", note: null, nutrients: { energy_kcal: 900, fat_g: 100 }, energyComputed: false } })],
    ]);
    // 100 ml × 0.92 = 92 g; 92 × 900 ÷ 100 = 828 kcal, ÷ 2 servings = 414.
    expect(nutritionPerServing([{ name: "Oil", quantity: 100, unit: "ml", consumableId: "oil" }], entries, 2)?.caloriesPerServing).toBe(414);
  });

  it("gives no figures when a rich ingredient could not be counted", () => {
    const entries = new Map([["potato", entry({ energy_kcal: 80 })]]);
    expect(
      nutritionPerServing(
        [
          { name: "Potato", quantity: 900, unit: "g", consumableId: "potato" },
          { name: "Butter, Salted", quantity: 60, unit: "g", consumableId: null },
        ],
        entries,
        4,
      ),
    ).toBeNull();
  });

  it("gives no figures when what was counted is too small a part of the dish, and names what was left out", () => {
    const entries = new Map([["spice", entry({ energy_kcal: 300 })]]);
    // 10 g counted out of 510 g weighable: far below the share needed.
    expect(
      nutritionPerServing(
        [
          { name: "Spice", quantity: 10, unit: "g", consumableId: "spice" },
          { name: "Curd", quantity: 500, unit: "g", consumableId: null },
        ],
        entries,
        2,
      ),
    ).toBeNull();
  });

  it("prefers the Indian Food Composition Tables where an item has them", () => {
    const entries = new Map([["dal", entry({ energy_kcal: 999 }, { ifct: { code: "A1", name: "Dal", match: "exact", note: null, nutrients: { energy_kcal: 340 }, energyComputed: false } })]]);
    expect(nutritionPerServing([{ name: "Dal", quantity: 100, unit: "g", consumableId: "dal" }], entries, 1)?.caloriesPerServing).toBe(340);
  });

  it("counts an item IFCT 2017 does not list by its USDA food (25-031)", () => {
    const usda = { fdcId: 171284, name: "Yogurt, plain, whole milk", match: "close" as const, note: null, nutrients: { energy_kcal: 61, protein_g: 3.47 } };
    const entries = new Map([["curd", entry({}, { nutrientBasis: null, usda })]]);
    const result = nutritionPerServing([{ name: "Curd", quantity: 200, unit: "g", consumableId: "curd" }], entries, 2);
    expect(result).toMatchObject({ caloriesPerServing: 61, counted: 1, total: 1 });
  });
});
