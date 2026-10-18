/**
 * Indian Food Composition Tables 2017 (ICMR–National Institute of Nutrition)
 * as catalog nutrition (HomeFood 25-009). Pure and import-free, so the seed
 * script (`scripts/catalog-ifct.ts`) runs it with Node's own type stripping.
 *
 * The digitised table (`@ifct2017/compositions`, MIT) keeps every mass in
 * grams per 100 g edible portion and energy in kJ. This turns one row into
 * the catalog's nutrient keys in their own units. A blank value is unknown and
 * stays absent, never 0.
 *
 * Energy: the table's own figure is kept. Where it gives none (its 14 oils)
 * or one its own protein, fat, carbohydrate and fibre contradict by more than
 * half (a digitising slip, e.g. chicken leg at twice its proximates), energy
 * is computed from those with IFCT's factors (17, 37, 17, 8 kJ/g) and the row
 * says so.
 */

export const IFCT_RELEASE = "IFCT 2017";
export const IFCT_CREDIT = "Indian Food Composition Tables 2017, ICMR–National Institute of Nutrition, Hyderabad";

/** The pinned digitisation the loader reads, and its checksum. */
export const IFCT_PACKAGE = {
  url: "https://registry.npmjs.org/@ifct2017/compositions/-/compositions-2.0.9.tgz",
  sha256: "623e31d4ea355cc829429c2d8e776fbdb5eba953ea713bad2b01c962d3e2cfd5",
  file: "package/index.csv",
} as const;

export type IfctFood = {
  code: string;
  name: string;
  scientific_name: string | null;
  food_group: string;
  local_names: string | null;
  release: string;
  nutrients: Record<string, number>;
  energy_basis: "stated" | "computed";
};

/** IFCT column → catalog key and the factor from grams (or kJ) to the key's unit. */
const COLUMNS: readonly [string, string, number][] = [
  ["protcnt", "protein_g", 1],
  ["choavldf", "carbohydrate_g", 1],
  ["fsugar", "sugars_g", 1],
  ["fatce", "fat_g", 1],
  ["fasat", "saturated_fat_g", 1],
  ["fibtg", "fibre_g", 1],
  ["na", "sodium_mg", 1000],
  ["ca", "calcium_mg", 1000],
  ["fe", "iron_mg", 1000],
  ["k", "potassium_mg", 1000],
  ["zn", "zinc_mg", 1000],
  ["vitc", "vitamin_c_mg", 1000],
  ["folsum", "folate_ug", 1_000_000],
];

const KJ_PER_KCAL = 4.184;

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

function number(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Energy in kJ from the table's own proximates, with IFCT's factors. */
export function proximateKj(grams: { protein: number; fat: number; carbohydrate: number; fibre: number }): number {
  return 17 * grams.protein + 37 * grams.fat + 17 * grams.carbohydrate + 8 * grams.fibre;
}

/**
 * Every IFCT food from the digitised table's rows (header first). The header
 * cells read "Energy; enerc": the code after the semicolon names the column.
 */
export function ifctFoods(rows: readonly string[][]): IfctFood[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const index = new Map(header.map((cell, position) => [cell.split(";").pop()!.trim(), position]));
  const cell = (row: readonly string[], code: string) => {
    const position = index.get(code);
    return position === undefined ? undefined : row[position];
  };
  const foods: IfctFood[] = [];
  for (const row of body) {
    const code = (cell(row, "code") ?? "").trim();
    const name = (cell(row, "name") ?? "").trim();
    if (!/^[A-T][0-9]{3}$/.test(code) || !name) continue;
    const nutrients: Record<string, number> = {};
    for (const [column, key, factor] of COLUMNS) {
      const value = number(cell(row, column));
      if (value !== null) nutrients[key] = round(value * factor, factor >= 1_000_000 ? 0 : 2);
    }
    const computedKj = proximateKj({
      protein: nutrients.protein_g ?? 0,
      fat: nutrients.fat_g ?? 0,
      carbohydrate: nutrients.carbohydrate_g ?? 0,
      fibre: nutrients.fibre_g ?? 0,
    });
    const statedKj = number(cell(row, "enerc"));
    const contradicted = statedKj !== null && computedKj > 0 && Math.abs(statedKj - computedKj) / computedKj > 0.5;
    const missing = (statedKj === null || statedKj === 0) && computedKj > 0;
    let energyBasis: IfctFood["energy_basis"] = "stated";
    if (missing || contradicted) {
      nutrients.energy_kcal = round(computedKj / KJ_PER_KCAL, 0);
      energyBasis = "computed";
    } else if (statedKj !== null) {
      nutrients.energy_kcal = round(statedKj / KJ_PER_KCAL, 0);
    }
    const scientific = (cell(row, "scie") ?? "").trim();
    const local = (cell(row, "lang") ?? "").trim();
    foods.push({
      code,
      name,
      scientific_name: scientific ? scientific.slice(0, 200) : null,
      food_group: (cell(row, "grup") ?? "").trim() || "Other",
      local_names: local ? local.slice(0, 2000) : null,
      release: IFCT_RELEASE,
      nutrients,
      energy_basis: energyBasis,
    });
  }
  return foods;
}

export type IfctLink = { slug: string; ifct_code: string; match_type: "exact" | "close" | "approximate"; note: string | null };

/** The curated mapping (supabase/seed/grocery-catalog/ifct-links.csv), checked against the foods it names. */
export function ifctLinks(rows: readonly string[][], codes: ReadonlySet<string>): { links: IfctLink[]; problems: string[] } {
  const [header, ...body] = rows;
  const problems: string[] = [];
  if (!header || header.join(",") !== "slug,ifct_code,match_type,note") return { links: [], problems: ["header must be slug,ifct_code,match_type,note"] };
  const seen = new Set<string>();
  const links: IfctLink[] = [];
  body.forEach((cells, position) => {
    const [slug = "", code = "", match = "", note = ""] = cells.map((value) => value.trim());
    const line = position + 2;
    if (!slug || seen.has(slug)) return void problems.push(`line ${line}: missing or duplicate slug "${slug}"`);
    if (!codes.has(code)) return void problems.push(`line ${line}: ${slug} names unknown IFCT code "${code}"`);
    if (match !== "exact" && match !== "close" && match !== "approximate") return void problems.push(`line ${line}: ${slug} has match "${match}"`);
    seen.add(slug);
    links.push({ slug, ifct_code: code, match_type: match, note: note ? note.slice(0, 300) : null });
  });
  return { links, problems };
}
