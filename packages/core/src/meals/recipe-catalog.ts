import type { SupabaseClient } from "@supabase/supabase-js";

import { catalogImageUrl } from "../commerce/catalog";

/**
 * WonderHome's recipe catalog (backlog 25-022): everyday Indian dishes every
 * household can browse, plan and keep as its own version. Platform data, the
 * same for every household, so the list is kept per server for a while
 * rather than read on every request (CLAUDE.md performance); a household's
 * own recipes are never cached.
 *
 * Every number here comes from the seed's arithmetic over the linked grocery
 * items (rule 9): nutrients per serving with how many ingredients they were
 * counted from, or none where too little could be counted.
 */

export const RECIPE_COURSES = ["breakfast", "main", "side", "rice", "snack", "sweet"] as const;
export type RecipeCourse = (typeof RECIPE_COURSES)[number];

export type CatalogRecipeSummary = {
  id: string;
  slug: string;
  name: string;
  region: string | null;
  course: RecipeCourse;
  diet: "veg" | "egg" | "non_veg";
  prepMinutes: number;
  cookMinutes: number;
  serves: number;
  description: string | null;
  imageUrl: string | null;
  tags: string[];
  caloriesPerServing: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  nutritionCounted: number | null;
  nutritionTotal: number | null;
  /** What it is made of, by name: what a vegan or Jain diet is checked against (`diet.ts`). */
  ingredientNames: string[];
};

export type CatalogRecipeIngredient = {
  name: string;
  quantity: number;
  unit: string;
  note: string | null;
  optional: boolean;
  groceryCatalogId: string | null;
  imageUrl: string | null;
};

export type CatalogRecipe = CatalogRecipeSummary & {
  steps: string[];
  ingredients: CatalogRecipeIngredient[];
  image: { licence: string | null; attribution: string | null; sourceUrl: string | null } | null;
};

type Row = Record<string, unknown>;
const SUMMARY_COLUMNS =
  "id, slug, name, region, course, diet, prep_minutes, cook_minutes, serves, description, image_path, tags, calories_per_serving, protein_grams, carbs_grams, fat_grams, nutrition_counted, nutrition_total";

function toSummary(row: Row, supabaseUrl: string): CatalogRecipeSummary {
  const number = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    region: (row.region as string | null) ?? null,
    course: row.course as RecipeCourse,
    diet: row.diet as CatalogRecipeSummary["diet"],
    prepMinutes: Number(row.prep_minutes),
    cookMinutes: Number(row.cook_minutes),
    serves: Number(row.serves),
    description: (row.description as string | null) ?? null,
    imageUrl: catalogImageUrl(supabaseUrl, (row.image_path as string | null) ?? null),
    tags: (row.tags as string[] | null) ?? [],
    caloriesPerServing: number(row.calories_per_serving),
    proteinGrams: number(row.protein_grams),
    carbsGrams: number(row.carbs_grams),
    fatGrams: number(row.fat_grams),
    nutritionCounted: number(row.nutrition_counted),
    nutritionTotal: number(row.nutrition_total),
    ingredientNames: ((row.recipe_catalog_ingredients as Row[] | null) ?? []).map((line) => String(line.name)),
  };
}

const TTL_MS = 10 * 60_000;
let cached: { at: number; url: string; value: Promise<CatalogRecipeSummary[]> } | null = null;

/** Every current catalog dish, by name — kept per server for ten minutes. Empty when the table is not there yet. */
export function listCatalogRecipes(supabase: SupabaseClient, supabaseUrl: string): Promise<CatalogRecipeSummary[]> {
  if (cached && cached.url === supabaseUrl && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = (async () => {
    const { data, error } = await supabase.from("recipe_catalog").select(`${SUMMARY_COLUMNS}, recipe_catalog_ingredients(name)`).eq("active", true).order("name").limit(500);
    if (error) throw new Error(`listCatalogRecipes failed: ${error.code ?? "unknown"}`);
    return ((data ?? []) as Row[]).map((row) => toSummary(row, supabaseUrl));
  })();
  cached = { at: Date.now(), url: supabaseUrl, value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  return value;
}

/** One dish, whole: its picture and credit, ingredients (with their grocery pictures) and steps. */
export async function getCatalogRecipe(supabase: SupabaseClient, slug: string, supabaseUrl: string): Promise<CatalogRecipe | null> {
  const { data, error } = await supabase
    .from("recipe_catalog")
    .select(`${SUMMARY_COLUMNS}, steps, image_licence, image_attribution, image_source_url, recipe_catalog_ingredients(position, name, quantity, unit, note, optional, grocery_catalog_id, grocery_catalog(image_path))`)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`getCatalogRecipe failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as Row;
  const lines = ((row.recipe_catalog_ingredients as Row[] | null) ?? []).sort((a, b) => Number(a.position) - Number(b.position));
  return {
    ...toSummary(row, supabaseUrl),
    steps: (row.steps as string[] | null) ?? [],
    image: row.image_path ? { licence: (row.image_licence as string | null) ?? null, attribution: (row.image_attribution as string | null) ?? null, sourceUrl: (row.image_source_url as string | null) ?? null } : null,
    ingredients: lines.map((line) => {
      const item = Array.isArray(line.grocery_catalog) ? (line.grocery_catalog[0] as Row | undefined) : (line.grocery_catalog as Row | null);
      return {
        name: line.name as string,
        quantity: Number(line.quantity),
        unit: line.unit as string,
        note: (line.note as string | null) ?? null,
        optional: line.optional === true,
        groceryCatalogId: (line.grocery_catalog_id as string | null) ?? null,
        imageUrl: catalogImageUrl(supabaseUrl, (item?.image_path as string | null) ?? null),
      };
    }),
  };
}

const normal = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The catalog dish a spoken or typed name means ("poha", "kanda poha",
 * "dal tadka"), or null. Exact by name or slug, else the one dish whose name
 * holds every word said (or the reverse) — two that fit mean no match, never
 * a guess.
 */
export function matchCatalogRecipe(said: string, recipes: readonly Pick<CatalogRecipeSummary, "slug" | "name">[]): Pick<CatalogRecipeSummary, "slug" | "name"> | null {
  const want = normal(said);
  if (!want) return null;
  const exact = recipes.find((recipe) => normal(recipe.name) === want || recipe.slug.replace(/-/g, " ") === want);
  if (exact) return exact;
  const words = want.split(" ").filter((word) => word.length > 2);
  if (words.length === 0) return null;
  const fits = recipes.filter((recipe) => {
    const name = ` ${normal(recipe.name)} ${recipe.slug.replace(/-/g, " ")} `;
    return words.every((word) => name.includes(` ${word} `) || name.includes(` ${word}`));
  });
  return fits.length === 1 ? fits[0]! : null;
}

/** The steps as a household recipe keeps them: one numbered line each. */
export function methodFromSteps(steps: readonly string[]): string {
  return steps.map((step, index) => `${index + 1}. ${step}`).join("\n").slice(0, 4000);
}
