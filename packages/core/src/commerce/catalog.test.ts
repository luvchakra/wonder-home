import { describe, expect, it } from "vitest";

import { chooseResults, cleanNutrients, fromOpenFoodFacts, parsePack, toCatalogEntry, type CatalogEntry } from "./catalog";
import { isCatalogQuality } from "./catalog-import";

const product = (over: Record<string, unknown> = {}) => ({
  code: "8901262010016",
  product_name: "Taaza Toned Milk",
  brands: "Amul",
  quantity: "500 ml",
  categories_tags: ["en:dairies", "en:milks"],
  image_front_small_url: "https://images.openfoodfacts.org/images/products/890/126/201/0016/front_en.3.200.jpg",
  nutriments: { "energy-kcal_100g": 58, proteins_100g: 3, sodium_100g: 0.05 },
  ...over,
});

describe("the shared grocery catalog", () => {
  it("maps an Open Food Facts product to a product row in the catalog's own categories", () => {
    const row = fromOpenFoodFacts(product());
    expect(row).toMatchObject({ kind: "product", source: "open_food_facts", brand: "Amul", category: "Dairy", pack_quantity: 500, pack_unit: "ml", nutrient_basis: "100ml" });
    expect(row!.nutrients).toEqual({ energy_kcal: 58, protein_g: 3, sodium_mg: 50 });
  });

  it("puts instant noodles under instant, not under noodles", () => {
    expect(fromOpenFoodFacts(product({ categories_tags: ["en:noodles", "en:instant-noodles"] }))!.category).toBe("Instant & ready to cook");
  });

  it("keeps a missing nutrient unknown, never zero", () => {
    expect(cleanNutrients({ energy_kcal: "x", fat_g: -1, protein_g: 2.345 })).toEqual({ protein_g: 2.35 });
  });

  it("reads one pack size and refuses multipacks", () => {
    expect(parsePack("1.5 kg")).toEqual({ quantity: 1.5, unit: "kg" });
    expect(parsePack("6 x 100 g")).toBeNull();
  });

  it("shows only Indian-barcode products with a brand, a pack and a picture, and no alcohol", () => {
    expect(isCatalogQuality(product())).toBe(true);
    expect(isCatalogQuality(product({ code: "3017620422003" }))).toBe(false);
    expect(isCatalogQuality(product({ brands: "" }))).toBe(false);
    expect(isCatalogQuality(product({ quantity: "6 x 100 g" }))).toBe(false);
    expect(isCatalogQuality(product({ image_front_small_url: "https://example.com/a.jpg" }))).toBe(false);
    expect(isCatalogQuality(product({ categories_tags: ["en:beverages", "en:alcoholic-beverages"] }))).toBe(false);
  });

  it("reads a curated item row as an item with its subcategory", () => {
    const entry = toCatalogEntry(
      { id: "c1", kind: "item", name: "Toor dal", brand: null, category: "Dals & pulses", subcategory: "Split dals", pack_quantity: 1, pack_unit: "kg", unit: "kg", image_path: null, nutrients: {}, nutrient_basis: null, source: "wonderhome", licence: "WonderHome curated", attribution: "WonderHome", source_url: null },
      "https://x.supabase.co",
    );
    expect(entry).toMatchObject({ kind: "item", subcategory: "Split dals", pack: { quantity: 1, unit: "kg" }, imageUrl: null, source: "wonderhome" });
  });
});

describe("what the quick search shows (25-010)", () => {
  const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
    id: over.name ?? "x",
    kind: "item",
    common: false,
    name: "x",
    brand: null,
    category: "Eggs",
    subcategory: null,
    pack: null,
    unit: "pcs",
    ladder: { unit: "pcs", sizes: [1] },
    imageUrl: null,
    imageCredit: null,
    nutrients: {},
    nutrientBasis: null,
    source: "wonderhome",
    licence: "",
    attribution: "",
    sourceUrl: null,
    ifct: null,
    ...over,
  });

  it("offers the everyday eggs and the brands, not every variant", () => {
    const items = [
      entry({ name: "Eggs, Duck" }),
      entry({ name: "Eggs, White", common: true }),
      entry({ name: "Eggs, Quail" }),
      entry({ name: "Eggs, Brown", common: true }),
    ];
    const products = [
      entry({ kind: "product", name: "Farm Eggs", brand: "Natural Farms", imageUrl: "https://x/1.jpg", source: "open_food_facts" }),
      entry({ kind: "product", name: "Farm eggs", brand: "Natural farms", imageUrl: "https://x/2.jpg", source: "open_food_facts" }),
      entry({ kind: "product", name: "Eggs", brand: null, imageUrl: "https://x/3.jpg", source: "open_food_facts" }),
      entry({ kind: "product", name: "Eggs 10", brand: "Eggoz", imageUrl: null, source: "open_food_facts" }),
    ];
    expect(chooseResults(items, products).map((shown) => shown.name)).toEqual(["Eggs, White", "Eggs, Brown", "Farm Eggs"]);
  });

  it("shows a less common item when only it answers the words", () => {
    expect(chooseResults([entry({ name: "Eggs, Duck" })], []).map((shown) => shown.name)).toEqual(["Eggs, Duck"]);
  });
});
