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
 * catalog id. A curated item says which reference food it is: its Indian food
 * in IFCT 2017 (25-009), else its USDA SR Legacy food (25-031).
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
  /**
   * For a curated item IFCT 2017 does not list (curd, butter, sugar), its USDA
   * FoodData Central SR Legacy food and how close (25-031): per 100 g, public domain.
   */
  usda: UsdaNutrition | null;
};

export type UsdaNutrition = {
  fdcId: number;
  name: string;
  match: "exact" | "close" | "approximate";
  note: string | null;
  nutrients: Nutrients;
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
  // Two keys join these tables (usda_foods.catalog_id is the research link), so the embed names its own.
  "usda_match, usda_note, usda_foods!grocery_catalog_usda_fdc_id_fkey(fdc_id, description, nutrients), " +
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
    usda: toUsda(row),
  };
}

function ladderFrom(raw: unknown, unit: string): Ladder {
  const sizes = Array.isArray(raw) ? raw.map(Number).filter((size) => Number.isFinite(size) && size > 0) : [];
  // Linear steps (buying-sizes.ts): a row stored with the older pack ladder steps by its first rung.
  return sizes.length > 0 ? { unit: baseOf(unit).unit, sizes: [sizes[0]!] } : defaultLadder(unit);
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

function toUsda(row: Row): UsdaNutrition | null {
  const food = (Array.isArray(row.usda_foods) ? row.usda_foods[0] : row.usda_foods) as Row | null | undefined;
  const match = row.usda_match;
  if (!food || (match !== "exact" && match !== "close" && match !== "approximate")) return null;
  return {
    fdcId: Number(food.fdc_id),
    name: food.description as string,
    match,
    note: (row.usda_note as string | null) ?? null,
    nutrients: cleanNutrients(food.nutrients),
  };
}

/**
 * Where a catalog entry's nutrition comes from, in order: its Indian food in
 * IFCT 2017, its USDA food, then what its own label states. The one rule every
 * reader (the item page, a card, a recipe's per-serving figures) follows.
 */
export function referenceNutrition(entry: Pick<CatalogEntry, "ifct" | "nutrients" | "nutrientBasis"> & { usda?: UsdaNutrition | null }): {
  source: "ifct" | "usda" | "label";
  nutrients: Nutrients;
  basis: "100g" | "100ml" | null;
} {
  if (entry.ifct && Object.keys(entry.ifct.nutrients).length > 0) return { source: "ifct", nutrients: entry.ifct.nutrients, basis: "100g" };
  if (entry.usda && Object.keys(entry.usda.nutrients).length > 0) return { source: "usda", nutrients: entry.usda.nutrients, basis: "100g" };
  return { source: "label", nutrients: entry.nutrients, basis: entry.nutrientBasis };
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

// ---------------------------------------------------------------------------
// An item made by name: what the catalog says about it (25-012)
// ---------------------------------------------------------------------------

/** What a name means in the catalog: the item itself when it is one, else just how such things are counted. */
export type NamedItem = {
  catalogId: string | null;
  unit: string;
  category: string | null;
  /** The usual buy, when the item (or every everyday kind of it) comes in the same pack. */
  pack: { quantity: number; unit: string } | null;
};

type NamedRow = { id: string; name: string; aliases: string[]; unit: string; category: string; common: boolean; pack?: { quantity: number; unit: string } | null };

function plainWords(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * "Pasta" said to HomeTalk, or left short by a meal, becomes an item the way
 * the catalog keeps it — never one piece of pasta. Pure: an exact name or
 * alias is that catalog item (its picture, nutrition and pack sizes come
 * with it); a word only its variants carry ("Pasta, penne", "Pasta,
 * macaroni") gives just how they are counted, and only when the everyday
 * ones agree. No variant is ever picked on the household's behalf.
 */
export function pickCatalogItem(name: string, rows: readonly NamedRow[]): NamedItem | null {
  const said = plainWords(name);
  if (!said) return null;
  const exact = rows.find((row) => plainWords(row.name) === said || row.aliases.some((alias) => plainWords(alias) === said));
  if (exact) return { catalogId: exact.id, unit: exact.unit, category: exact.category, pack: exact.pack ?? null };
  const variants = rows.filter((row) => row.name.includes(",") && plainWords(row.name.split(",")[0]!) === said);
  const everyday = variants.filter((row) => row.common);
  const counted = everyday.length > 0 ? everyday : variants;
  if (counted.length === 0) return null;
  const bases = new Set(counted.map((row) => baseOf(row.unit).unit));
  if (bases.size !== 1) return null;
  const categories = new Set(counted.map((row) => row.category));
  const packs = new Set(counted.map((row) => (row.pack ? `${row.pack.quantity} ${row.pack.unit}` : "none")));
  const pack = packs.size === 1 ? (counted[0]!.pack ?? null) : null;
  return { catalogId: null, unit: counted[0]!.unit, category: categories.size === 1 ? counted[0]!.category : null, pack };
}

/** The catalog's reading of a name a person said, or null when it has nothing certain to add. */
export async function catalogItemFor(supabase: SupabaseClient, name: string): Promise<NamedItem | null> {
  const needle = searchWords(name);
  if (needle.length < 2) return null;
  const { data, error } = await supabase.rpc("search_grocery_catalog_kind", { p_query: needle, p_limit: 20, p_kind: "item" });
  if (error) return null;
  const rows = ((data ?? []) as Row[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    unit: row.unit as string,
    category: row.category as string,
    common: row.common === true,
    pack: row.pack_quantity && row.pack_unit ? { quantity: Number(row.pack_quantity), unit: row.pack_unit as string } : null,
  }));
  return pickCatalogItem(name, rows);
}

/**
 * The line a grocery card shows under its name (25-012): energy and protein
 * per 100 g or 100 ml, from the same source the item page credits — the
 * item's Indian food in IFCT 2017, its USDA food, or a packed product's own
 * label (`referenceNutrition`). Null when none is on record: nothing is estimated.
 */
export function cardNutrition(entry: (Pick<CatalogEntry, "ifct" | "nutrients" | "nutrientBasis"> & { usda?: UsdaNutrition | null }) | null): {
  basis: "100g" | "100ml";
  energyKcal: number | null;
  proteinG: number | null;
  source: "ifct" | "usda" | "label";
} | null {
  if (!entry) return null;
  const { nutrients, basis, source } = referenceNutrition(entry);
  if (!basis) return null;
  const energyKcal = nutrients.energy_kcal ?? null;
  const proteinG = nutrients.protein_g ?? null;
  if (energyKcal === null && proteinG === null) return null;
  return { basis, energyKcal, proteinG, source };
}
