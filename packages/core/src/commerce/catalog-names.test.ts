import { describe, expect, it } from "vitest";

import { cardNutrition, pickCatalogItem } from "./catalog";

const row = (id: string, name: string, unit: string, extra: { aliases?: string[]; common?: boolean; category?: string } = {}) => ({
  id,
  name,
  unit,
  aliases: extra.aliases ?? [],
  common: extra.common ?? false,
  category: extra.category ?? "Rice & grains",
});

describe("an item made by name is counted the way the catalog counts it (25-012)", () => {
  const pasta = [
    row("penne", "Pasta, penne", "g", { common: true }),
    row("macaroni", "Pasta, macaroni", "g", { common: true, aliases: ["macaroni", "elbow pasta"] }),
    row("spaghetti", "Pasta, spaghetti", "g"),
    row("sauce", "Pasta sauce", "jar", { category: "Sauces" }),
    row("instant", "Pasta, Instant masala", "packet", { category: "Instant" }),
  ];

  it("'pasta' is grams, without picking a shape on the household's behalf", () => {
    expect(pickCatalogItem("pasta", pasta)).toEqual({ catalogId: null, unit: "g", category: "Rice & grains", pack: null });
    const packed = pasta.map((entry) => ({ ...entry, pack: entry.unit === "g" ? { quantity: 500, unit: "g" } : null }));
    expect(pickCatalogItem("pasta", packed)?.pack).toEqual({ quantity: 500, unit: "g" });
    expect(pickCatalogItem("Pasta", pasta)?.unit).toBe("g");
  });

  it("an exact name or alias is that item, with its link", () => {
    expect(pickCatalogItem("macaroni", pasta)).toEqual({ catalogId: "macaroni", unit: "g", category: "Rice & grains", pack: null });
    expect(pickCatalogItem("Pasta sauce", pasta)).toEqual({ catalogId: "sauce", unit: "jar", category: "Sauces", pack: null });
  });

  it("everyday variants that disagree on how they are counted say nothing", () => {
    expect(pickCatalogItem("eggs", [row("w", "Eggs, White", "pcs", { common: true }), row("d", "Eggs, Duck", "pack", { common: true })])).toBeNull();
    expect(pickCatalogItem("eggs", [row("w", "Eggs, White", "pcs", { common: true }), row("b", "Eggs, Brown", "pcs", { common: true }), row("d", "Eggs, Duck", "pack")])?.unit).toBe("pcs");
  });

  it("a name the catalog does not hold is left alone", () => {
    expect(pickCatalogItem("glitter", pasta)).toBeNull();
    expect(pickCatalogItem("", pasta)).toBeNull();
  });
});

describe("the nutrition a card shows", () => {
  it("prefers the Indian food it is, per 100 g", () => {
    expect(
      cardNutrition({ ifct: { code: "M001", name: "Egg", match: "close", note: null, nutrients: { energy_kcal: 134, protein_g: 13.3 }, energyComputed: false }, nutrients: {}, nutrientBasis: null }),
    ).toEqual({ basis: "100g", energyKcal: 134, proteinG: 13.3, source: "ifct" });
  });

  it("uses a packed product's label, per 100 ml when it says so", () => {
    expect(cardNutrition({ ifct: null, nutrients: { energy_kcal: 62 }, nutrientBasis: "100ml" })).toEqual({ basis: "100ml", energyKcal: 62, proteinG: null, source: "label" });
  });

  it("shows nothing it does not have", () => {
    expect(cardNutrition(null)).toBeNull();
    expect(cardNutrition({ ifct: null, nutrients: {}, nutrientBasis: null })).toBeNull();
    expect(cardNutrition({ ifct: null, nutrients: { fat_g: 3 }, nutrientBasis: "100g" })).toBeNull();
  });
});
