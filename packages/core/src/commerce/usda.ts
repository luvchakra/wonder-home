/**
 * USDA FoodData Central (SR Legacy) as catalog nutrition for the curated items
 * IFCT 2017 does not list (HomeFood 25-031): curd, butter, cream, sugar,
 * coconut milk, whole spices. Pure and import-free, so the seed script
 * (`scripts/catalog-usda.ts`) runs it with Node's own type stripping.
 *
 * SR Legacy is public domain. Its CSVs keep each nutrient as one row per food
 * (`food_nutrient.csv`), already per 100 g and in the unit `nutrient.csv`
 * names. This picks the catalog's keys out of those rows. A nutrient USDA
 * does not state for a food stays absent, never 0.
 */

export const USDA_RELEASE = "SR Legacy 2018-04";
export const USDA_CREDIT = "USDA FoodData Central, SR Legacy";

/** The pinned release the loader reads, and its checksum. */
export const USDA_PACKAGE = {
  url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
  sha256: "b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0",
  folder: "FoodData_Central_sr_legacy_food_csv_2018-04",
} as const;

/** USDA nutrient id → catalog key; the units already match (g, mg, µg, kcal). */
const NUTRIENTS: ReadonlyMap<string, string> = new Map([
  ["1008", "energy_kcal"],
  ["1003", "protein_g"],
  ["1005", "carbohydrate_g"],
  ["2000", "sugars_g"],
  ["1004", "fat_g"],
  ["1258", "saturated_fat_g"],
  ["1079", "fibre_g"],
  ["1093", "sodium_mg"],
  ["1087", "calcium_mg"],
  ["1089", "iron_mg"],
  ["1092", "potassium_mg"],
  ["1095", "zinc_mg"],
  ["1162", "vitamin_c_mg"],
  ["1177", "folate_ug"],
]);

export type UsdaFood = {
  fdc_id: number;
  data_type: "sr_legacy";
  description: string;
  food_category: string | null;
  release: string;
  nutrients: Record<string, number>;
};

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

function columns(header: readonly string[] | undefined): Map<string, number> {
  return new Map((header ?? []).map((cell, position) => [cell.trim(), position]));
}

/**
 * The foods named by `wanted`, from SR Legacy's `food.csv`, `food_category.csv`
 * and `food_nutrient.csv` rows (each with its header first).
 */
export function usdaFoods(
  tables: { food: readonly string[][]; category: readonly string[][]; foodNutrient: readonly string[][] },
  wanted: ReadonlySet<number>,
): UsdaFood[] {
  const [categoryHeader, ...categoryRows] = tables.category;
  const c = columns(categoryHeader);
  const categories = new Map(categoryRows.map((row) => [row[c.get("id")!] ?? "", (row[c.get("description")!] ?? "").trim()]));

  const [nutrientHeader, ...nutrientRows] = tables.foodNutrient;
  const n = columns(nutrientHeader);
  const values = new Map<number, Record<string, number>>();
  for (const row of nutrientRows) {
    const id = Number(row[n.get("fdc_id")!]);
    if (!wanted.has(id)) continue;
    const key = NUTRIENTS.get((row[n.get("nutrient_id")!] ?? "").trim());
    const amount = Number(row[n.get("amount")!]);
    if (!key || !Number.isFinite(amount) || amount < 0 || (row[n.get("amount")!] ?? "").trim() === "") continue;
    const food = values.get(id) ?? {};
    food[key] = key === "energy_kcal" || key === "folate_ug" ? round(amount, 0) : round(amount, 2);
    values.set(id, food);
  }

  const [foodHeader, ...foodRows] = tables.food;
  const f = columns(foodHeader);
  const foods: UsdaFood[] = [];
  for (const row of foodRows) {
    const id = Number(row[f.get("fdc_id")!]);
    if (!wanted.has(id)) continue;
    const description = (row[f.get("description")!] ?? "").trim();
    if (!description) continue;
    foods.push({
      fdc_id: id,
      data_type: "sr_legacy",
      description: description.slice(0, 300),
      food_category: categories.get(row[f.get("food_category_id")!] ?? "")?.slice(0, 120) || null,
      release: USDA_RELEASE,
      nutrients: values.get(id) ?? {},
    });
  }
  return foods;
}

export type UsdaLink = { slug: string; fdc_id: number; match_type: "exact" | "close" | "approximate"; note: string | null };

/** The curated mapping (supabase/seed/grocery-catalog/usda-links.csv), checked against the foods it names. */
export function usdaLinks(rows: readonly string[][], ids: ReadonlySet<number>): { links: UsdaLink[]; problems: string[] } {
  const [header, ...body] = rows;
  const problems: string[] = [];
  if (!header || header.join(",") !== "slug,fdc_id,match_type,note") return { links: [], problems: ["header must be slug,fdc_id,match_type,note"] };
  const seen = new Set<string>();
  const links: UsdaLink[] = [];
  body.forEach((cells, position) => {
    const [slug = "", id = "", match = "", note = ""] = cells.map((value) => value.trim());
    const line = position + 2;
    if (!slug || seen.has(slug)) return void problems.push(`line ${line}: missing or duplicate slug "${slug}"`);
    if (!/^[0-9]+$/.test(id) || !ids.has(Number(id))) return void problems.push(`line ${line}: ${slug} names unknown USDA food "${id}"`);
    if (match !== "exact" && match !== "close" && match !== "approximate") return void problems.push(`line ${line}: ${slug} has match "${match}"`);
    seen.add(slug);
    links.push({ slug, fdc_id: Number(id), match_type: match, note: note ? note.slice(0, 300) : null });
  });
  return { links, problems };
}
