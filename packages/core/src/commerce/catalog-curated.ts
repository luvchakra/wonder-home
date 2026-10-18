/**
 * WonderHome's own curated catalog items (HomeFood 25-006): the generic things
 * a household buys, written by WonderHome in
 * `supabase/seed/grocery-catalog/items.csv` and loaded by
 * `scripts/catalog-seed.ts`. Pure and import-free, so the seed script runs it
 * with Node's own type stripping.
 *
 * A row's `slug` is its stable source id: re-running the seed updates the same
 * catalog entry (and so keeps its catalog id), never adds a second one.
 */

export const CURATED_HEADER = ["slug", "name", "category", "subcategory", "is_food", "unit", "pack_quantity", "pack_unit", "aliases", "common"] as const;

/** The units a curated item may be kept in: units.ts's UNIT_CHOICES (a test holds them equal). */
export const CURATED_UNITS = ["pcs", "g", "kg", "ml", "l", "dozen", "bunch", "pack", "packet", "bottle", "box", "jar", "can", "bag", "loaf", "tray"] as const;
/** The units a usual pack is stated in: the convertible ones. */
export const PACK_UNITS = ["g", "kg", "ml", "l", "pcs", "dozen"] as const;

export const CURATED_LICENCE = "WonderHome curated";
export const CURATED_ATTRIBUTION = "WonderHome";

export type CuratedRow = {
  source: "wonderhome";
  source_id: string;
  kind: "item";
  name: string;
  brand: null;
  category: string;
  subcategory: string | null;
  aliases: string[];
  is_food: boolean;
  /** What a household means by the word: search shows these, and the rest only when someone asks for them by name. */
  common: boolean;
  pack_quantity: number | null;
  pack_unit: string | null;
  unit: string;
  barcode: null;
  nutrients: Record<string, never>;
  nutrient_basis: null;
  licence: string;
  attribution: string;
  source_url: null;
  search_text: string;
  countries: string[];
  source_updated_at: null;
};

/** The search words: what a person types, lowercased and without punctuation. Devanagari and other scripts are kept. */
export function searchWords(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

export type CuratedProblem = { line: number; problem: string };

/**
 * Every curated item as a catalog row, or the problems that stop the seed:
 * a bad header, a duplicate slug or name, a unit or pack the units module
 * does not know, a value too long for the table.
 */
export function curatedRows(csv: string): { rows: CuratedRow[]; problems: CuratedProblem[] } {
  const [header, ...body] = parseCsv(csv);
  const problems: CuratedProblem[] = [];
  if (!header || header.join(",") !== CURATED_HEADER.join(",")) {
    return { rows: [], problems: [{ line: 1, problem: `header must be ${CURATED_HEADER.join(",")}` }] };
  }
  const slugs = new Set<string>();
  const names = new Set<string>();
  const rows: CuratedRow[] = [];
  body.forEach((cells, index) => {
    const line = index + 2;
    if (cells.length !== CURATED_HEADER.length) {
      problems.push({ line, problem: `expected ${CURATED_HEADER.length} fields, found ${cells.length}` });
      return;
    }
    const [slug, rawName, category, subcategory, isFood, unit, packQuantity, packUnit, aliases, common] = cells.map((cell) => cell.trim()) as [string, string, string, string, string, string, string, string, string, string];
    const name = rawName.replace(/\s+/g, " ");
    const fail = (problem: string) => problems.push({ line, problem: `${slug || "(no slug)"}: ${problem}` });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64) return fail("slug must be lowercase words joined by hyphens");
    if (slugs.has(slug)) return fail("duplicate slug");
    if (name.length < 1 || name.length > 160) return fail("name must be 1–160 characters");
    if (names.has(name.toLocaleLowerCase())) return fail(`duplicate name "${name}"`);
    if (category.length < 1 || category.length > 40) return fail("category must be 1–40 characters");
    if (subcategory.length > 60) return fail("subcategory is longer than 60 characters");
    if (isFood !== "true" && isFood !== "false") return fail("is_food must be true or false");
    if (common !== "true" && common !== "false") return fail("common must be true or false");
    if (!(CURATED_UNITS as readonly string[]).includes(unit)) return fail(`unknown unit "${unit}"`);
    const quantity = packQuantity === "" ? null : Number(packQuantity);
    if (quantity !== null && !(Number.isFinite(quantity) && quantity > 0)) return fail("pack_quantity must be a positive number");
    if ((quantity === null) !== (packUnit === "")) return fail("pack_quantity and pack_unit go together");
    if (packUnit !== "" && !(PACK_UNITS as readonly string[]).includes(packUnit)) return fail(`unknown pack unit "${packUnit}"`);
    const otherNames = [...new Set(aliases.split("|").map((alias) => alias.trim().replace(/\s+/g, " ")).filter((alias) => alias && alias.toLocaleLowerCase() !== name.toLocaleLowerCase()))];
    if (otherNames.length > 30) return fail("more than 30 other names");
    if (otherNames.some((alias) => alias.length > 80)) return fail("an other name is longer than 80 characters");
    slugs.add(slug);
    names.add(name.toLocaleLowerCase());
    rows.push({
      source: "wonderhome",
      source_id: slug,
      kind: "item",
      name,
      brand: null,
      category,
      subcategory: subcategory || null,
      aliases: otherNames,
      is_food: isFood === "true",
      common: common === "true",
      pack_quantity: quantity,
      pack_unit: packUnit || null,
      unit,
      barcode: null,
      nutrients: {},
      nutrient_basis: null,
      licence: CURATED_LICENCE,
      attribution: CURATED_ATTRIBUTION,
      source_url: null,
      // The name first, so "starts with" ranks on the name; then every other name.
      search_text: searchWords([name, ...otherNames].join(" ")),
      countries: ["en:india"],
      source_updated_at: null,
    });
  });
  return { rows, problems };
}
