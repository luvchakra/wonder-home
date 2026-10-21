/**
 * Loads the USDA FoodData Central (SR Legacy) foods the curated mapping names
 * into `usda_foods`, and links WonderHome's curated catalog items to them
 * (HomeFood 25-031) — for the items IFCT 2017 does not list.
 *
 *   npm run catalog:usda            check the release and the mapping, show what would change
 *   npm run catalog:usda -- --apply write both to the project in apps/web/.env.local
 *
 * The release is read from USDA's own pinned, checksummed SR Legacy CSV
 * download (public domain), never kept in this repository. The mapping
 * (supabase/seed/grocery-catalog/usda-links.csv) is WonderHome's own work.
 * Idempotent: foods are upserted by FDC id, and an item's link is set to what
 * the mapping says — cleared when the mapping no longer names it.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import { createClient } from "@supabase/supabase-js";

import { parseCsv } from "../packages/core/src/commerce/catalog-curated.ts";
import { USDA_PACKAGE, usdaFoods, usdaLinks } from "../packages/core/src/commerce/usda.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");

/** One file out of a zip archive, found through its central directory. */
function unzipFile(archive: Buffer, wanted: string): string | null {
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) return null;
  const entries = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  for (let index = 0; index < entries; index += 1) {
    const method = archive.readUInt16LE(offset + 10);
    const compressed = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const local = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name === wanted) {
      const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
      const data = archive.subarray(start, start + compressed);
      return (method === 0 ? data : inflateRawSync(data)).toString("utf8");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

const response = await fetch(USDA_PACKAGE.url);
if (!response.ok) {
  console.error(`Could not download the USDA release (${response.status}).`);
  process.exit(1);
}
const archive = Buffer.from(await response.arrayBuffer());
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== USDA_PACKAGE.sha256) {
  console.error(`The USDA release's checksum changed (${digest}); nothing was written.`);
  process.exit(1);
}
const table = (file: string) => {
  const text = unzipFile(archive, `${USDA_PACKAGE.folder}/${file}`);
  if (!text) {
    console.error(`${file} is missing from the release.`);
    process.exit(1);
  }
  return parseCsv(text);
};

const food = table("food.csv");
const known = new Set(food.slice(1).map((row) => Number(row[0])));
const { links, problems } = usdaLinks(parseCsv(await readFile(join(ROOT, "supabase", "seed", "grocery-catalog", "usda-links.csv"), "utf8")), known);
if (problems.length > 0) {
  for (const problem of problems) console.error(`usda-links.csv ${problem}`);
  process.exit(1);
}
const wantedIds = new Set(links.map((link) => link.fdc_id));
const foods = usdaFoods({ food, category: table("food_category.csv"), foodNutrient: table("food_nutrient.csv") }, wantedIds);
const empty = foods.filter((entry) => entry.nutrients.energy_kcal === undefined).map((entry) => entry.fdc_id);
if (empty.length > 0) {
  console.error(`These USDA foods state no energy: ${empty.join(", ")}`);
  process.exit(1);
}
const byMatch = links.reduce<Record<string, number>>((counts, link) => ({ ...counts, [link.match_type]: (counts[link.match_type] ?? 0) + 1 }), {});
console.log(`${foods.length} USDA foods; ${links.length} curated items linked: ${JSON.stringify(byMatch)}`);

if (!apply) {
  console.log("Checked. Run with --apply to write them.");
  process.exit(0);
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
if (!vars.NEXT_PUBLIC_SUPABASE_URL || !vars.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to apply.");
  process.exit(1);
}
const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const now = new Date().toISOString();
const { error: foodError } = await admin.from("usda_foods").upsert(foods.map((entry) => ({ ...entry, imported_at: now })), { onConflict: "fdc_id" });
if (foodError) {
  console.error(`Writing USDA foods failed: ${foodError.code ?? "unknown"}`);
  process.exit(1);
}

// Paged: a read returns at most 1,000 rows.
const items: Record<string, unknown>[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error: readError } = await admin.from("grocery_catalog").select("id, source_id, usda_fdc_id, usda_match, usda_note").eq("source", "wonderhome").order("id").range(from, from + 999);
  if (readError) {
    console.error(`Reading curated items failed: ${readError.code ?? "unknown"}`);
    process.exit(1);
  }
  items.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
const wanted = new Map(links.map((link) => [link.slug, link]));
const slugs = new Set(items.map((item) => item.source_id as string));
const unknown = links.filter((link) => !slugs.has(link.slug)).map((link) => link.slug);
if (unknown.length > 0) {
  console.error(`The mapping names items not in the catalog: ${unknown.join(", ")}`);
  process.exit(1);
}
let changed = 0;
for (const item of items) {
  const link = wanted.get(item.source_id as string);
  const next = { usda_fdc_id: link?.fdc_id ?? null, usda_match: link?.match_type ?? null, usda_note: link?.note ?? null };
  if (next.usda_fdc_id === item.usda_fdc_id && next.usda_match === item.usda_match && next.usda_note === item.usda_note) continue;
  const { error } = await admin.from("grocery_catalog").update(next).eq("id", item.id as string);
  if (error) {
    console.error(`Linking ${item.source_id} failed: ${error.code ?? "unknown"}`);
    process.exit(1);
  }
  changed += 1;
}
console.log(`Applied: ${foods.length} USDA foods written; ${changed} catalog links changed.`);
