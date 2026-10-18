/**
 * Loads IFCT 2017 (ICMR–National Institute of Nutrition) into `ifct_foods` and
 * links WonderHome's curated catalog items to their Indian food (HomeFood 25-009).
 *
 *   npm run catalog:ifct            check the table and the mapping, show what would change
 *   npm run catalog:ifct -- --apply write both to the project in apps/web/.env.local
 *
 * The table is read from a pinned, checksummed copy of its MIT-licensed
 * digitisation (`@ifct2017/compositions`), never kept in this repository; the
 * data's own rights are NIN's (see the migration). The mapping
 * (supabase/seed/grocery-catalog/ifct-links.csv) is WonderHome's own work.
 * Idempotent: foods are upserted by code, and an item's link is set to what
 * the mapping says — cleared when the mapping no longer names it.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { createClient } from "@supabase/supabase-js";

import { parseCsv } from "../packages/core/src/commerce/catalog-curated.ts";
import { IFCT_PACKAGE, ifctFoods, ifctLinks } from "../packages/core/src/commerce/ifct.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");

/** One file out of a ustar archive: 512-byte headers, each followed by its data padded to 512. */
function untarFile(archive: Buffer, wanted: string): string | null {
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const header = archive.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    if (!name) break;
    const size = parseInt(header.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim() || "0", 8);
    const start = offset + 512;
    if (name === wanted) return archive.subarray(start, start + size).toString("utf8");
    offset = start + Math.ceil(size / 512) * 512;
  }
  return null;
}

const response = await fetch(IFCT_PACKAGE.url);
if (!response.ok) {
  console.error(`Could not download the IFCT package (${response.status}).`);
  process.exit(1);
}
const tarball = Buffer.from(await response.arrayBuffer());
const digest = createHash("sha256").update(tarball).digest("hex");
if (digest !== IFCT_PACKAGE.sha256) {
  console.error(`The IFCT package's checksum changed (${digest}); nothing was written.`);
  process.exit(1);
}
const csv = untarFile(gunzipSync(tarball), IFCT_PACKAGE.file);
if (!csv) {
  console.error(`${IFCT_PACKAGE.file} is missing from the package.`);
  process.exit(1);
}

const foods = ifctFoods(parseCsv(csv));
const computed = foods.filter((food) => food.energy_basis === "computed");
console.log(`${foods.length} IFCT foods; energy computed from proximates for ${computed.length}: ${computed.map((food) => food.code).join(", ")}`);

const { links, problems } = ifctLinks(parseCsv(await readFile(join(ROOT, "supabase", "seed", "grocery-catalog", "ifct-links.csv"), "utf8")), new Set(foods.map((food) => food.code)));
if (problems.length > 0) {
  for (const problem of problems) console.error(`ifct-links.csv ${problem}`);
  process.exit(1);
}
const byMatch = links.reduce<Record<string, number>>((counts, link) => ({ ...counts, [link.match_type]: (counts[link.match_type] ?? 0) + 1 }), {});
console.log(`${links.length} curated items linked: ${JSON.stringify(byMatch)}`);

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
const { error: foodError } = await admin.from("ifct_foods").upsert(foods.map((food) => ({ ...food, imported_at: now })), { onConflict: "code" });
if (foodError) {
  console.error(`Writing IFCT foods failed: ${foodError.code ?? "unknown"}`);
  process.exit(1);
}

// Paged: a read returns at most 1,000 rows.
const items: Record<string, unknown>[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error: readError } = await admin.from("grocery_catalog").select("id, source_id, ifct_code, ifct_match, ifct_note").eq("source", "wonderhome").order("id").range(from, from + 999);
  if (readError) {
    console.error(`Reading curated items failed: ${readError.code ?? "unknown"}`);
    process.exit(1);
  }
  items.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
const wanted = new Map(links.map((link) => [link.slug, link]));
const known = new Set(items.map((item) => item.source_id as string));
const unknown = links.filter((link) => !known.has(link.slug)).map((link) => link.slug);
if (unknown.length > 0) {
  console.error(`The mapping names items not in the catalog: ${unknown.join(", ")}`);
  process.exit(1);
}
let changed = 0;
for (const item of items) {
  const link = wanted.get(item.source_id as string);
  const next = { ifct_code: link?.ifct_code ?? null, ifct_match: link?.match_type ?? null, ifct_note: link?.note ?? null };
  if (next.ifct_code === item.ifct_code && next.ifct_match === item.ifct_match && next.ifct_note === item.ifct_note) continue;
  const { error } = await admin.from("grocery_catalog").update(next).eq("id", item.id as string);
  if (error) {
    console.error(`Linking ${item.source_id} failed: ${error.code ?? "unknown"}`);
    process.exit(1);
  }
  changed += 1;
}
console.log(`Applied: ${foods.length} IFCT foods written; ${changed} catalog links changed.`);
