import type { SupabaseClient } from "@supabase/supabase-js";

import { baseOf, defaultLadder, startAmount, uniformLadder, type Ladder } from "./buying-sizes";
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

export const NUTRIENT_KEYS = [
  "energy_kcal",
  "protein_g",
  "carbohydrate_g",
  "sugars_g",
  "fat_g",
  "saturated_fat_g",
  "fibre_g",
  "sodium_mg",
  // What IFCT 2017 also measures for Indian foods (25-009); a label rarely states them.
  "calcium_mg",
  "iron_mg",
  "potassium_mg",
  "zinc_mg",
  "vitamin_c_mg",
  "folate_ug",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Partial<Record<NutrientKey, number>>;

export type CatalogSource = "wonderhome" | "open_food_facts" | "usda";

export type CatalogEntry = {
  id: string;
  kind: "item" | "product";
  /** The everyday variant a household means by the word (25-010). */
  common: boolean;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  pack: { quantity: number; unit: string } | null;
  unit: string;
  /** The amounts + and − step through, in the unit's base (25-010). */
  ladder: Ladder;
  imageUrl: string | null;
  /** Who made the picture and its licence, shown wherever it is (Wikimedia Commons pictures need it). */
  imageCredit: string | null;
  nutrients: Nutrients;
  nutrientBasis: "100g" | "100ml" | null;
  source: CatalogSource;
  licence: string;
  attribution: string;
  sourceUrl: string | null;
  /**
   * For a curated item, the Indian food it is in IFCT 2017 (ICMR–NIN) and how
   * close (25-009): nutrition per 100 g edible portion, credited to NIN.
   */
  ifct: IfctNutrition | null;
};

export type IfctNutrition = {
  code: string;
  name: string;
  match: "exact" | "close" | "approximate";
  note: string | null;
  nutrients: Nutrients;
  energyComputed: boolean;
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
  /** A packed product steps by its own pack (25-010). */
  buy_sizes: number[] | null;
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
  "ifct_match, ifct_note, ifct_foods(code, name, nutrients, energy_basis), " +
  "id, kind, common, buy_sizes, image_licence, image_attribution, name, brand, category, subcategory, pack_quantity, pack_unit, unit, image_path, nutrients, nutrient_basis, source, licence, attribution, source_url";

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
    common: row.common === true,
    name: row.name as string,
    brand: (row.brand as string | null) ?? null,
    category: row.category as string,
    subcategory: (row.subcategory as string | null) ?? null,
    pack: packQuantity && row.pack_unit ? { quantity: packQuantity, unit: row.pack_unit as string } : null,
    unit: row.unit as string,
    ladder: ladderFrom(row.buy_sizes, row.unit as string),
    imageUrl: catalogImageUrl(supabaseUrl, (row.image_path as string | null) ?? null),
    imageCredit: row.image_attribution ? [row.image_attribution, row.image_licence].filter(Boolean).join(", ") : null,
    nutrients: cleanNutrients(row.nutrients),
    nutrientBasis: (row.nutrient_basis as CatalogEntry["nutrientBasis"]) ?? null,
    source: row.source as CatalogEntry["source"],
    licence: row.licence as string,
    attribution: row.attribution as string,
    sourceUrl: (row.source_url as string | null) ?? null,
    ifct: toIfct(row),
  };
}

function ladderFrom(raw: unknown, unit: string): Ladder {
  const sizes = Array.isArray(raw) ? raw.map(Number).filter((size) => Number.isFinite(size) && size > 0) : [];
  return sizes.length > 0 ? { unit: baseOf(unit).unit, sizes } : defaultLadder(unit);
}

/**
 * The ladder a household's item steps through: its own step when it set one;
 * else the catalog entry it came from, when that counts the same way; else
 * its unit's natural default.
 */
export function householdLadder(item: { unit: string; step: number | null; catalog?: Pick<CatalogEntry, "ladder"> | null }): Ladder {
  if (item.step && item.step > 0) return uniformLadder(item.unit, item.step);
  const base = baseOf(item.unit).unit;
  if (item.catalog && item.catalog.ladder.unit === base) return item.catalog.ladder;
  return defaultLadder(item.unit);
}

/** A household item's ladder and where a first add starts on it: the catalog's usual buy, else the first rung. */
export function stepperOf(item: { unit: string; step: number | null; catalog?: Pick<CatalogEntry, "ladder" | "pack"> | null }): { ladder: Ladder; start: number } {
  const ladder = householdLadder(item);
  const pack = item.catalog?.pack;
  const usual = pack && baseOf(pack.unit).unit === ladder.unit ? pack.quantity * baseOf(pack.unit).factor : null;
  return { ladder, start: startAmount(ladder, usual) };
}

function toIfct(row: Row): IfctNutrition | null {
  const food = (Array.isArray(row.ifct_foods) ? row.ifct_foods[0] : row.ifct_foods) as Row | null | undefined;
  const match = row.ifct_match;
  if (!food || (match !== "exact" && match !== "close" && match !== "approximate")) return null;
  return {
    code: food.code as string,
    name: food.name as string,
    match,
    note: (row.ifct_note as string | null) ?? null,
    nutrients: cleanNutrients(food.nutrients),
    energyComputed: food.energy_basis === "computed",
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
 * What a quick search shows (25-010), from the ranked items and products:
 * - the everyday items a household means by the word — only those when any
 *   match, so "eggs" is white and brown eggs, not duck and quail; a word only
 *   a less common item answers ("duck eggs") shows that one;
 * - then the brands on sale: one entry per brand and name (a product in three
 *   pack sizes is one choice, since the amount is picked afterwards), and only
 *   those with a picture.
 */
export function chooseResults(items: readonly CatalogEntry[], products: readonly CatalogEntry[], limits = { items: 4, products: 6 }): CatalogEntry[] {
  const everyday = items.filter((item) => item.common);
  const shownItems = (everyday.length > 0 ? everyday : items).slice(0, everyday.length > 0 ? limits.items : 3);
  const seen = new Set<string>();
  const shownProducts: CatalogEntry[] = [];
  // Beside an everyday item, a few brands; on their own (a brand searched by name), more.
  const productLimit = everyday.length > 0 ? Math.min(3, limits.products) : limits.products;
  for (const product of products) {
    if (!product.brand || !product.imageUrl) continue;
    const key = searchWords(`${product.brand} ${product.name}`);
    if (seen.has(key)) continue;
    seen.add(key);
    shownProducts.push(product);
    if (shownProducts.length >= productLimit) break;
  }
  return [...shownItems, ...shownProducts];
}

/**
 * Catalog entries for what someone typed, best first, ranked in the database
 * (`public.search_grocery_catalog_kind`) and chosen by `chooseResults`. Reads only.
 */
export async function searchCatalog(supabase: SupabaseClient, query: string, options: { supabaseUrl: string }): Promise<CatalogEntry[]> {
  const needle = searchWords(query);
  if (needle.length < 2) return [];
  const [items, products] = await Promise.all([
    supabase.rpc("search_grocery_catalog_kind", { p_query: needle, p_limit: 12, p_kind: "item" }),
    supabase.rpc("search_grocery_catalog_kind", { p_query: needle, p_limit: 30, p_kind: "product" }),
  ]);
  const error = items.error ?? products.error;
  if (error) throw new Error(`searchCatalog failed: ${error.code ?? "unknown"}`);
  const entries = (data: unknown) => ((data ?? []) as Row[]).map((row) => toCatalogEntry(row, options.supabaseUrl));
  return chooseResults(entries(items.data), entries(products.data));
}

export async function getCatalogEntry(supabase: SupabaseClient, id: string, supabaseUrl: string): Promise<CatalogEntry | null> {
  const { data, error } = await supabase.from("grocery_catalog").select(CATALOG_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getCatalogEntry failed: ${error.code ?? "unknown"}`);
  return data ? toCatalogEntry(data as unknown as Row, supabaseUrl) : null;
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
    buy_sizes: pack ? [pack.quantity * baseOf(pack.unit).factor] : null,
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
