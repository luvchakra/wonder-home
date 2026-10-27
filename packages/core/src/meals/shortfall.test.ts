import { describe, expect, it } from "vitest";

import type { GroceryItem } from "../commerce/inventory";
import type { IngredientNeed } from "./meals";
import { itemFor, mealShortfalls, servingScale } from "./shortfall";

const item = (id: string, name: string, unit: string, stock: number | null, toBuy: number | null = null, extra: Partial<GroceryItem> = {}): GroceryItem => ({
  id, name, category: "grocery", unit, step: null, lowLevel: null, storage: null, note: null, aliases: [], imageUrl: null, imagePath: null, catalog: null, lastPurchasedOn: null, updatedAt: "2026-09-20T00:00:00Z",
  stock: stock === null ? null : { quantity: stock, unit: unit === "kg" ? "g" : unit === "l" ? "ml" : unit, confirmedAt: "2026-09-20T00:00:00Z", confirmedBy: null, source: "stated", version: 1, useBy: null, useByBasis: null },
  toBuy: toBuy === null ? null : { entryId: `e-${id}`, quantity: toBuy, unit: unit === "kg" ? "g" : unit === "l" ? "ml" : unit, version: 1, source: "manual", mealId: null },
  ...extra,
});
const need = (name: string, quantity: number, unit: string, extra: Partial<IngredientNeed> = {}): IngredientNeed => ({ name, consumableId: null, quantity, unit, essential: true, status: "needed", ...extra });

describe("servingScale", () => {
  it("is the planned servings over the recipe's, and 1 when either is not said", () => {
    expect(servingScale(6, 4)).toBe(1.5);
    expect(servingScale(null, 4)).toBe(1);
    expect(servingScale(4, null)).toBe(1);
  });
});

describe("mealShortfalls", () => {
  const groceries = [
    item("pasta", "Pasta", "g", 200),
    item("tomatoes", "Tomatoes", "kg", 0, 300),
    item("milk", "Milk", "l", null),
    item("rice", "Rice", "kg", 2000),
    item("basil", "Basil", "bunch", 0),
  ];

  it("takes what is at home and what is already on the list off what the meal needs, in the item's unit", () => {
    const result = mealShortfalls({ ingredients: [need("Pasta", 500, "g"), need("Tomatoes", 0.5, "kg")], scale: 1, groceries });
    expect(result.short).toEqual([
      expect.objectContaining({ name: "Pasta", itemId: "pasta", short: { quantity: 300, unit: "g" }, basis: "measured" }),
      expect.objectContaining({ name: "Tomatoes", short: { quantity: 200, unit: "g" }, basis: "measured" }),
    ]);
  });

  it("scales to the servings planned", () => {
    const result = mealShortfalls({ ingredients: [need("Pasta", 500, "g")], scale: servingScale(6, 4), groceries });
    expect(result.short[0]).toMatchObject({ need: { quantity: 750, unit: "g" }, short: { quantity: 550, unit: "g" } });
  });

  it("covers what is at home and adds nothing for it", () => {
    const result = mealShortfalls({ ingredients: [need("Rice", 500, "g")], scale: 1, groceries });
    expect(result.short).toEqual([]);
    expect(result.covered[0]).toMatchObject({ name: "Rice", short: null });
  });

  it("calls a gap an estimate when nobody has said how much is at home", () => {
    const result = mealShortfalls({ ingredients: [need("Milk", 250, "ml")], scale: 1, groceries });
    expect(result.short[0]).toMatchObject({ have: null, short: { quantity: 250, unit: "ml" }, basis: "estimate" });
  });

  it("an ingredient with no amount offers one usual step when there is none, and nothing when there is some", () => {
    const result = mealShortfalls({ ingredients: [need("Basil", 1, "unit"), need("Rice", 1, "unit")], scale: 1, groceries });
    expect(result.short).toEqual([expect.objectContaining({ name: "Basil", need: null, short: { quantity: 1, unit: "bunch" }, basis: "unmeasured" })]);
    expect(result.covered).toEqual([expect.objectContaining({ name: "Rice", short: null })]);
  });

  it("an ingredient nobody tracks is offered as measured, labelled an estimate", () => {
    const result = mealShortfalls({ ingredients: [need("Paneer", 200, "g"), need("Coriander", 1, "unit")], scale: 1, groceries });
    expect(result.short).toEqual([
      expect.objectContaining({ name: "Paneer", itemId: null, short: { quantity: 200, unit: "g" }, basis: "estimate" }),
      expect.objectContaining({ name: "Coriander", itemId: null, short: { quantity: 1, unit: "pcs" }, basis: "estimate" }),
    ]);
  });

  it("reads the \"unit\" placeholder as an amount nobody gave, never as one piece", () => {
    const [line] = mealShortfalls({ ingredients: [need("Coriander", 1, "unit")], scale: 1, groceries: [] }).short;
    expect(line).toEqual(expect.objectContaining({ name: "Coriander", need: null, basis: "estimate" }));
  });

  it("leaves out what the household said it has or swapped", () => {
    const result = mealShortfalls({ ingredients: [need("Pasta", 900, "g", { status: "have" }), need("Paneer", 1, "unit", { status: "substituted", substituteName: "Tofu" })], scale: 1, groceries });
    expect(result.short).toEqual([]);
    expect(result.covered).toEqual([]);
  });

  it("never converts across dimensions: grams of an item kept in bunches is not measured", () => {
    const result = mealShortfalls({ ingredients: [need("Basil", 20, "g")], scale: 1, groceries });
    expect(result.short[0]).toMatchObject({ need: null, short: { quantity: 1, unit: "bunch" } });
  });
});

describe("itemFor", () => {
  it("uses the link, else one exact name or alias, and never picks between two", () => {
    const groceries = [item("a", "Milk", "l", 1), item("b", "Toned milk", "l", 1, null, { aliases: ["milk"] })];
    expect(itemFor({ name: "anything", consumableId: "b" }, groceries)?.id).toBe("b");
    expect(itemFor({ name: "Milk", consumableId: null }, groceries)).toBeNull();
    expect(itemFor({ name: "Toned milk", consumableId: null }, groceries)?.id).toBe("b");
  });
});
