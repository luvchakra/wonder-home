import type { SupabaseClient } from "@supabase/supabase-js";

import { searchWords } from "./catalog-curated";
import { normalizeUnit, unitInfo } from "./units";

/**
 * The shared grocery catalog (HomeFood 25-006): what "Add an item" searches
 * the way a quick-commerce app does — a picture, the name, the brand and the
 * pack — from one platform table every household reads and none writes.
 *
 * Two kinds of entry, each with its source and credit kept on the row:
 * - an **item**: a generic thing WonderHome curated itself ("Toor dal",
 *   "Detergent powder"), with the other names people type for it — Hindi in
 *   both scripts, regional names, common spellings
 *   (`supabase/seed/grocery-catalog/items.csv`);
 * - a **product**: a packed product from open data, Open Food Facts (ODbL;
 *   pictures CC BY-SA), with its brand, pack and label nutrients.
 * A nutrient the source does not state is absent, never 0. A row's id is its
 * catalog id; USDA foods link to it by review (`usda_foods.catalog_id`).
 *
 * This file is the read side and the pure mapping from a source's record to
 * a catalog row; `catalog-import.ts` is the server's import.
 */

export const CATALOG_BUCKET = "grocery-catalog";

export const NUTRIENT_KEYS = ["energy_kcal", "protein_g", "carbohydrate_g", "sugars_g", "fat_g", "saturated_fat_g", "fibre_g", "sodium_mg"] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Partial<Record<NutrientKey, number>>;

export type CatalogSource = "wonderhome" | "open_food_facts" | "usda";

export type CatalogEntry = {
  id: string;
  kind: "item" | "product";
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  pack: { quantity: number; unit: string } | null;
  unit: string;
  imageUrl: string | null;
  nutrients: Nutrients;
  nutrientBasis: "100g" | "100ml" | null;
  source: CatalogSource;
  licence: string;
  attribution: string;
  sourceUrl: string | null;
};

/** A row as the import writes it. */
export type CatalogRow = {
  source: CatalogSource;
  source_id: string;
  kind: "item" | "product";
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  aliases: string[];
  is_food: boolean;
  pack_quantity: number | null;
  pack_unit: string | null;
  unit: string;
  barcode: string | null;
  nutrients: Nutrients;
  nutrient_basis: "100g" | "100ml" | null;
  licence: string;
  attribution: string;
  source_url: string | null;
  search_text: string;
  countries: string[];
  source_updated_at: string | null;
};

type Row = Record<string, unknown>;

export const CATALOG_COLUMNS =
  "id, kind, name, brand, category, subcategory, pack_quantity, pack_unit, unit, image_path, nutrients, nutrient_basis, source, licence, attribution, source_url";

/** A picture's public address in the catalog bucket, on the project's own origin. */
export function catalogImageUrl(supabaseUrl: string, path: string | null): string | null {
  if (!path) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${CATALOG_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function toCatalogEntry(row: Row, supabaseUrl: string): CatalogEntry {
  const packQuantity = row.pack_quantity === null || row.pack_quantity === undefined ? null : Number(row.pack_quantity);
  return {
    id: row.id as string,
    kind: row.kind === "item" ? "item" : "product",
    name: row.name as string,
    brand: (row.brand as string | null) ?? null,
    category: row.category as string,
    subcategory: (row.subcategory as string | null) ?? null,
    pack: packQuantity && row.pack_unit ? { quantity: packQuantity, unit: row.pack_unit as string } : null,
    unit: row.unit as string,
    imageUrl: catalogImageUrl(supabaseUrl, (row.image_path as string | null) ?? null),
    nutrients: cleanNutrients(row.nutrients),
    nutrientBasis: (row.nutrient_basis as CatalogEntry["nutrientBasis"]) ?? null,
    source: row.source as CatalogEntry["source"],
    licence: row.licence as string,
    attribution: row.attribution as string,
    sourceUrl: (row.source_url as string | null) ?? null,
  };
}

/** Only known keys with real, non-negative numbers. */
export function cleanNutrients(value: unknown): Nutrients {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    const number = typeof raw[key] === "number" ? (raw[key] as number) : typeof raw[key] === "string" ? Number(raw[key]) : NaN;
    if (Number.isFinite(number) && number >= 0) out[key] = Math.round(number * 100) / 100;
  }
  return out;
}

export { searchWords } from "./catalog-curated";

/**
 * Catalog entries for what someone typed, best first, ranked in the database
 * (`public.search_grocery_catalog`): a name that starts with it, then a word
 * of the name or another name that starts with it, then anything containing
 * it — WonderHome's items before products, pictures first. Reads only.
 */
export async function searchCatalog(supabase: SupabaseClient, query: string, options: { supabaseUrl: string; limit?: number }): Promise<CatalogEntry[]> {
  const needle = searchWords(query);
  if (needle.length < 2) return [];
  const limit = Math.min(options.limit ?? 8, 20);
  const { data, error } = await supabase.rpc("search_grocery_catalog", { p_query: needle, p_limit: limit });
  if (error) throw new Error(`searchCatalog failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map((row) => toCatalogEntry(row, options.supabaseUrl));
}

export async function getCatalogEntry(supabase: SupabaseClient, id: string, supabaseUrl: string): Promise<CatalogEntry | null> {
  const { data, error } = await supabase.from("grocery_catalog").select(CATALOG_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getCatalogEntry failed: ${error.code ?? "unknown"}`);
  return data ? toCatalogEntry(data as Row, supabaseUrl) : null;
}

// ---------------------------------------------------------------------------
// From a source's record to a catalog row (pure)
// ---------------------------------------------------------------------------

/** "500 g", "1L", "1.5 kg", "200ml", "6 pcs" — one amount, or null for "6 x 100 g" and the like. */
export function parsePack(raw: unknown): { quantity: number; unit: string } | null {
  if (typeof raw !== "string") return null;
  const match = raw.trim().toLowerCase().replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*([a-z]+)\.?$/);
  if (!match) return null;
  const quantity = Number(match[1]);
  const unit = normalizeUnit(match[2]);
  if (!unit || !(quantity > 0) || unitInfo(unit).dimension === "each") return null;
  return { quantity, unit };
}

/**
 * Open Food Facts category tags to the catalog's own categories — the same
 * words WonderHome's curated items use, so a search shows one set. The most
 * specific rule comes first: instant noodles are "Instant & ready to cook"
 * before they are noodles.
 */
const OFF_CATEGORIES: readonly [RegExp, string][] = [
  [/en:(instant-noodles|instant-soups|soups|ready-meals|meals|mixes)\b/, "Instant & ready to cook"],
  [/en:(frozen-foods|frozen-desserts|ice-creams)\b/, "Frozen"],
  [/en:(chocolates|confectioneries|candies|sweets|indian-sweets)\b/, "Sweets & chocolates"],
  [/en:(breakfast-cereals|cereal-flakes|mueslis|granolas)\b/, "Breakfast & cereals"],
  [/en:(teas|coffees|beverages|drinks|juices|waters|sodas|carbonated-drinks|plant-based-beverages)\b/, "Beverages"],
  [/en:(pickles|chutneys|papads)\b/, "Pickles, chutneys & papad"],
  [/en:(sauces|condiments|spreads|ketchups|mayonnaises|vinegars|pastes)\b/, "Sauces, spreads & condiments"],
  [/en:(vegetable-oils|oils|ghees|fats)\b/, "Oils & ghee"],
  [/en:(sugars|honeys|sweeteners|jaggeries|syrups)\b/, "Sugar & sweeteners"],
  [/en:(nuts|dried-fruits|seeds|dates)\b/, "Dry fruits, nuts & seeds"],
  [/en:(spices|salts|herbs|condiments-spices)\b/, "Spices & masalas"],
  [/en:(dairies|milks|cheeses|yogurts|butters|dairy|creams)\b/, "Dairy"],
  [/en:eggs\b/, "Eggs"],
  [/en:(meats|fishes|seafood|poultries)\b/, "Meat & fish"],
  [/en:(flours|wheat-flours)\b/, "Atta & flours"],
  [/en:(legumes|pulses|lentils)\b/, "Dals & pulses"],
  [/en:(cereals-and-their-products|rices|pastas|noodles|cereal-grains)\b/, "Rice & grains"],
  [/en:(breads|cakes|pastries|bakery|viennoiseries)\b/, "Bakery"],
  [/en:(snacks|chips|crisps|biscuits|cookies|sweet-snacks|salty-snacks|crackers)\b/, "Snacks"],
  [/en:(fresh-vegetables|vegetables|vegetables-based-foods)\b/, "Vegetables"],
  [/en:(fruits|fresh-fruits|fruits-based-foods)\b/, "Fruits"],
];

function categoryFromTags(tags: unknown): string {
  const list = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
  for (const [pattern, category] of OFF_CATEGORIES) if (list.some((tag) => pattern.test(tag))) return category;
  return "Grocery";
}

const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined);

/**
 * One Open Food Facts product as a catalog row, or null when it lacks a
 * barcode or a name. Its per-100 nutrients are copied as stated (sodium from
 * grams to milligrams); its picture is fetched separately by the import.
 */
export function fromOpenFoodFacts(product: Row): CatalogRow | null {
  const code = typeof product.code === "string" ? product.code.trim() : "";
  const rawName = product.product_name_en ?? product.product_name;
  const name = typeof rawName === "string" ? rawName.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  if (!/^[0-9]{6,14}$/.test(code) || !name) return null;
  const brands = Array.isArray(product.brands) ? product.brands : typeof product.brands === "string" ? product.brands.split(",") : [];
  const brand = (brands.map((entry) => String(entry).trim()).find(Boolean) ?? null)?.slice(0, 120) ?? null;
  const pack = parsePack(product.quantity);
  const dimension = pack ? unitInfo(pack.unit).dimension : null;
  const n = (product.nutriments ?? {}) as Row;
  const sodium = number(n.sodium_100g);
  const nutrients = cleanNutrients({
    energy_kcal: number(n["energy-kcal_100g"]),
    protein_g: number(n.proteins_100g),
    carbohydrate_g: number(n.carbohydrates_100g),
    sugars_g: number(n.sugars_100g),
    fat_g: number(n.fat_100g),
    saturated_fat_g: number(n["saturated-fat_100g"]),
    fibre_g: number(n.fiber_100g),
    sodium_mg: sodium === undefined ? undefined : sodium * 1000,
  });
  const countries = Array.isArray(product.countries_tags) ? product.countries_tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20) : [];
  const updated = number(product.last_modified_t);
  return {
    source: "open_food_facts",
    source_id: code,
    kind: "product",
    name,
    brand,
    category: categoryFromTags(product.categories_tags),
    subcategory: null,
    aliases: [],
    is_food: true,
    pack_quantity: pack?.quantity ?? null,
    pack_unit: pack?.unit ?? null,
    unit: pack ? unitInfo(pack.unit).key : "pcs",
    barcode: code,
    nutrients,
    nutrient_basis: Object.keys(nutrients).length === 0 ? null : dimension === "volume" ? "100ml" : "100g",
    licence: "ODbL 1.0 (data), CC BY-SA 3.0 (picture)",
    attribution: "Open Food Facts contributors",
    source_url: `https://world.openfoodfacts.org/product/${code}`,
    search_text: searchWords([name, brand ?? "", typeof product.generic_name === "string" ? product.generic_name : ""].join(" ")),
    countries,
    source_updated_at: updated ? new Date(updated * 1000).toISOString() : null,
  };
}
