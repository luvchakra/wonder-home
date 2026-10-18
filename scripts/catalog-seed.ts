/**
 * Loads WonderHome's curated catalog items into the shared grocery catalog
 * (HomeFood 25-006).
 *
 *   npm run catalog:seed            check the file and show what would change
 *   npm run catalog:seed -- --apply write it to the project in apps/web/.env.local
 *
 * Idempotent: each item is one row per slug, updated in place, so its catalog
 * id never changes. An item taken out of the file is set inactive (search no
 * longer shows it), never deleted, so a household's link to it still holds.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { ladderForItem } from "../packages/core/src/commerce/buying-sizes.ts";
import { curatedRows } from "../packages/core/src/commerce/catalog-curated.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "supabase", "seed", "grocery-catalog", "items.csv");
const apply = process.argv.includes("--apply");

const { rows, problems } = curatedRows(await readFile(FILE, "utf8"));
if (problems.length > 0) {
  for (const { line, problem } of problems) console.error(`items.csv:${line}  ${problem}`);
  console.error(`${problems.length} problem(s); nothing was written.`);
  process.exit(1);
}

const byCategory = new Map<string, number>();
for (const row of rows) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1);
console.log(`${rows.length} curated items in ${byCategory.size} categories`);
for (const [category, count] of [...byCategory].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(4)}  ${category}`);

if (!apply) {
  console.log("Checked. Run with --apply to write them.");
  process.exit(0);
}

async function env(): Promise<Record<string, string>> {
  const text = await readFile(join(ROOT, "apps", "web", ".env.local"), "utf8").catch(() => "");
  const file = Object.fromEntries(
    text
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
  return { ...file, ...process.env } as Record<string, string>;
}

const vars = await env();
if (!vars.NEXT_PUBLIC_SUPABASE_URL || !vars.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to apply.");
  process.exit(1);
}
const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const now = new Date().toISOString();
for (let start = 0; start < rows.length; start += 400) {
  // Each item's ladder of natural amounts (commerce/buying-sizes.ts).
  const batch = rows.slice(start, start + 400).map((row) => ({ ...row, buy_sizes: ladderForItem(row).sizes, active: true, imported_at: now }));
  const { error } = await admin.from("grocery_catalog").upsert(batch, { onConflict: "source,source_id" });
  if (error) {
    console.error(`Upsert failed at row ${start}: ${error.code ?? "unknown"}`);
    process.exit(1);
  }
}

// Items no longer in the file stop showing in search; their rows stay.
const keep = new Set(rows.map((row) => row.source_id));
// Paged: a read returns at most 1,000 rows.
const existing: Record<string, unknown>[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error: readError } = await admin.from("grocery_catalog").select("id, source_id").eq("source", "wonderhome").eq("active", true).order("id").range(from, from + 999);
  if (readError) {
    console.error(`Reading curated items failed: ${readError.code ?? "unknown"}`);
    process.exit(1);
  }
  existing.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
const retired = existing.filter((row) => !keep.has(row.source_id as string)).map((row) => row.id as string);
for (let start = 0; start < retired.length; start += 200) {
  const { error } = await admin.from("grocery_catalog").update({ active: false }).in("id", retired.slice(start, start + 200));
  if (error) {
    console.error(`Retiring failed: ${error.code ?? "unknown"}`);
    process.exit(1);
  }
}
console.log(`Applied: ${rows.length} items written, ${retired.length} retired.`);
