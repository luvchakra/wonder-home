/**
 * Seeds WonderHome's recipe catalog (backlog 25-022) from `recipes.ts`.
 *
 *   npx tsx scripts/recipe-catalog/seed.mts                 # check only
 *   npx tsx scripts/recipe-catalog/seed.mts --apply <dir>   # write, with pictures from <dir>/<slug>.jpg
 *
 * Every ingredient must name a grocery-catalog item exactly; the check fails
 * otherwise. Nutrients per serving are worked out with the same
 * `nutritionPerServing` a household's own recipe uses, from the linked items
 * (IFCT 2017 where an item has it), and keep how many ingredients they were
 * counted from. Pictures are Wikimedia Commons files listed in
 * `pictures.tsv` with their licence and author; only an accepted CC licence
 * or public domain is copied. Idempotent: a recipe is matched by its slug and
 * its ingredients replaced.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { CATALOG_COLUMNS, toCatalogEntry, type CatalogEntry } from "../../packages/core/src/commerce/catalog";
import { nutritionPerServing } from "../../packages/core/src/meals/ingredient-nutrition";
import { RECIPES } from "./recipes";

const ROOT = new URL("../..", import.meta.url).pathname;
const LICENCE = /^(CC BY(-SA)? [0-9.]+|CC0|Public domain)$/;
const apply = process.argv.includes("--apply");
const pictureDir = apply ? process.argv[process.argv.indexOf("--apply") + 1] : null;

const tsv = await readFile(join(ROOT, "scripts", "recipe-catalog", "pictures.tsv"), "utf8");
const pictures = new Map(
  tsv
    .trim()
    .split("\n")
    .map((line) => line.split("\t"))
    .map(([slug = "", title = "", , licence = "", artist = ""]) => [slug, { title, licence: licence.trim(), artist: artist.trim() || "Unknown author", page: `https://commons.wikimedia.org/wiki/File:${title}` }]),
);

const problems: string[] = [];
const slugs = new Set<string>();
for (const recipe of RECIPES) {
  if (slugs.has(recipe.slug)) problems.push(`${recipe.slug}: listed twice`);
  slugs.add(recipe.slug);
  if (recipe.steps.length < 1 || recipe.steps.length > 8) problems.push(`${recipe.slug}: ${recipe.steps.length} steps; keep it between 1 and 8`);
  const picture = pictures.get(recipe.slug);
  if (picture && !LICENCE.test(picture.licence)) problems.push(`${recipe.slug}: licence "${picture.licence}" is not accepted`);
}

const text = await readFile(join(ROOT, "apps", "web", ".env.local"), "utf8").catch(() => "");
const vars: Record<string, string | undefined> = {
  ...Object.fromEntries(
    text
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  ),
  ...process.env,
};
const url = vars.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !vars.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
  process.exit(1);
}
const admin = createClient(url, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const names = [...new Set(RECIPES.flatMap((recipe) => recipe.ingredients.map((line) => line.item)))];
const { data: rows, error } = await admin.from("grocery_catalog").select(CATALOG_COLUMNS).eq("kind", "item").in("name", names);
if (error) throw new Error(`reading the grocery catalog failed: ${error.message}`);
const byName = new Map<string, CatalogEntry>();
for (const row of (rows ?? []) as Record<string, unknown>[]) {
  const entry = toCatalogEntry(row, url);
  if (!byName.has(entry.name) || row.common === true) byName.set(entry.name, entry);
}
for (const name of names) if (!byName.has(name)) problems.push(`no grocery-catalog item named "${name}"`);

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const planned = RECIPES.map((recipe) => {
  // Frying oil is not counted; pieces with a stated weight are counted by it.
  const lines = recipe.ingredients
    .filter((line) => !line.frying)
    .map((line) => ({ name: line.item, quantity: line.grams ?? line.quantity, unit: line.grams ? "g" : line.unit, consumableId: byName.get(line.item)!.id }));
  const entries = new Map([...byName.values()].map((entry) => [entry.id, entry]));
  return { recipe, nutrition: nutritionPerServing(lines, entries, recipe.serves) };
});
for (const { recipe, nutrition } of planned) {
  console.log(`${recipe.slug.padEnd(16)} ${nutrition ? `${nutrition.caloriesPerServing} kcal, ${nutrition.proteinGrams} g protein a serving (from ${nutrition.counted} of ${nutrition.total})` : "no nutrients"}${pictures.has(recipe.slug) ? "" : "  [no picture]"}`);
}
if (!apply) {
  console.log(`Checked ${RECIPES.length} recipes. Run with --apply <picture dir> to write them.`);
  process.exit(0);
}

let written = 0;
const failed: string[] = [];
for (const { recipe, nutrition } of planned) {
  const picture = pictures.get(recipe.slug);
  let imagePath: string | null = null;
  if (picture && pictureDir) {
    const bytes = await readFile(join(pictureDir, `${recipe.slug}.jpg`)).catch(() => null);
    if (bytes && bytes.byteLength > 0 && bytes.byteLength < 2_000_000) {
      const path = `recipes/${recipe.slug}.jpg`;
      const { error: uploadError } = await admin.storage.from("grocery-catalog").upload(path, bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "604800" });
      if (uploadError) failed.push(`${recipe.slug} (picture upload)`);
      else imagePath = path;
    } else failed.push(`${recipe.slug} (no picture file)`);
  }
  const row = {
    slug: recipe.slug,
    name: recipe.name,
    region: recipe.region,
    course: recipe.course,
    diet: recipe.diet,
    prep_minutes: recipe.prepMinutes,
    cook_minutes: recipe.cookMinutes,
    serves: recipe.serves,
    description: recipe.description,
    steps: recipe.steps,
    tags: recipe.tags,
    ...(imagePath && picture ? { image_path: imagePath, image_licence: picture.licence, image_attribution: picture.artist.slice(0, 160), image_source_url: picture.page } : {}),
    calories_per_serving: nutrition?.caloriesPerServing ?? null,
    protein_grams: nutrition?.proteinGrams ?? null,
    carbs_grams: nutrition?.carbsGrams ?? null,
    fat_grams: nutrition?.fatGrams ?? null,
    nutrition_counted: nutrition?.counted ?? 0,
    nutrition_total: recipe.ingredients.filter((line) => !line.frying).length,
    active: true,
  };
  const { data: saved, error: saveError } = await admin.from("recipe_catalog").upsert(row, { onConflict: "slug" }).select("id").single();
  if (saveError || !saved) {
    failed.push(`${recipe.slug} (${saveError?.message ?? "not saved"})`);
    continue;
  }
  await admin.from("recipe_catalog_ingredients").delete().eq("recipe_id", saved.id);
  const { error: lineError } = await admin.from("recipe_catalog_ingredients").insert(
    recipe.ingredients.map((line, position) => ({
      recipe_id: saved.id,
      position,
      name: line.item,
      quantity: line.quantity,
      unit: line.unit,
      grocery_catalog_id: byName.get(line.item)!.id,
      note: line.frying ? "for frying; not counted in the nutrients" : (line.note ?? null),
      optional: line.optional === true || line.frying === true,
    })),
  );
  if (lineError) failed.push(`${recipe.slug} (ingredients: ${lineError.message})`);
  else written += 1;
}
console.log(`Applied: ${written} recipes written.${failed.length ? ` Problems: ${failed.join(", ")}` : ""}`);
