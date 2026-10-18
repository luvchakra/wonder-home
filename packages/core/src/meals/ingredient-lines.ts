import { normalizeUnit } from "../commerce/units";

/**
 * One ingredient as a recipe or a meal keeps it: a raw item and how much of
 * it — and, once resolved on the server (`ingredient-links.ts`), the
 * household's own grocery item it is (25-017).
 */
export type IngredientLine = {
  name: string;
  quantity: number;
  unit: string;
  /** The household's grocery item, when the row was picked from the catalog or the household's own items. */
  consumableId?: string | null;
  /** What the row was picked from, as the form sent it — `catalog:<id>` or `item:<id>`. Resolved on the server, never trusted. */
  ref?: string | null;
};

/** What a form's ingredient rows send: the same position in each list is one row. */
export type IngredientRowsInput = { names: string[]; quantities: string[]; units: string[]; refs?: string[] };

/** The most rows one form may carry, the same cap `addMealIngredients` keeps. */
export const MAX_INGREDIENT_ROWS = 40;

/**
 * A form's ingredient rows as lines a recipe or a meal stores (rule 20: the
 * item is typed, the unit is picked). A row with no name is dropped. A row
 * with no amount keeps "unit", the placeholder the shortfall reads as "how
 * much is not known", rather than inventing "1 pc". The amount is decimal
 * (rule 22's spirit for quantities too: 1.5 kg, never 1500 typed as grams by
 * accident), read with a comma or a point. The same item twice in one unit is
 * one line with both amounts; in two units the first one stands, since a
 * recipe or meal keeps one line per name.
 */
export function ingredientLinesFrom(input: IngredientRowsInput): IngredientLine[] {
  const lines: IngredientLine[] = [];
  const byName = new Map<string, IngredientLine>();
  const count = Math.min(input.names.length, MAX_INGREDIENT_ROWS);
  for (let index = 0; index < count; index += 1) {
    const raw = (input.names[index] ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (!raw) continue;
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    const amount = readQuantity(input.quantities[index]);
    const ref = readRef(input.refs?.[index]);
    const line: IngredientLine = amount === null
      ? { name, quantity: 1, unit: "unit", ...(ref ? { ref } : {}) }
      : { name, quantity: amount, unit: normalizeUnit(input.units[index]) ?? "pcs", ...(ref ? { ref } : {}) };
    const key = name.toLowerCase();
    const earlier = byName.get(key);
    if (earlier) {
      if (earlier.unit === line.unit && line.unit !== "unit") earlier.quantity = round(earlier.quantity + line.quantity);
      continue;
    }
    byName.set(key, line);
    lines.push(line);
  }
  return lines;
}

/** A typed amount, or null for none: "1.5", "1,5" and "2" read; nothing, zero or a word is "not known". */
export function readQuantity(raw: string | undefined): number | null {
  const text = (raw ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(text)) return null;
  const value = round(Number(text));
  return value > 0 && value < 100_000_000 ? value : null;
}

/** A form's ingredient rows (`ui/ingredient-rows.tsx`, prefix `essential`, `ingredient` …) as the lists `ingredientLinesFrom` reads. */
export function ingredientRowsOf(form: FormData, prefix: string): IngredientRowsInput {
  const all = (field: string) => form.getAll(`${prefix}${field}`).map((value) => (typeof value === "string" ? value : ""));
  return { names: all("Name"), quantities: all("Quantity"), units: all("Unit"), refs: all("Ref") };
}

/** A row's pick, only in the two shapes the form makes: anything else is a typed name. */
function readRef(raw: string | undefined): string | null {
  const text = (raw ?? "").trim();
  return /^(?:catalog|item):[0-9a-f-]{36}$/i.test(text) ? text.toLowerCase() : null;
}

/** Two places, what `numeric(10, 2)` keeps. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
