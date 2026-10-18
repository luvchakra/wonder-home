"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { UNIT_CHOICES } from "../../commerce/units";
import { cn } from "../../lib/cn";
import { CatalogItemField } from "./catalog-item-field";
import { ComboboxField } from "./combobox-field";

export type IngredientRowsLabels = {
  /** The group's heading, e.g. "What does it need?". */
  legend: string;
  item: string;
  itemPlaceholder: string;
  amount: string;
  unit: string;
  /** Under the rows: an amount can be left empty. */
  hint: string;
  addRow: string;
  /** `{name}` is the row's item, or the word for "this item" when it has none yet. */
  removeRow: string;
  thisItem: string;
  addNewUnit: string;
  chooseUnit: string;
};

type Row = { key: number; name: string; quantity?: string; unit?: string; ref?: string };

/** One thing an item field offers (25-017): the household's own grocery item, or a catalog entry. */
export type IngredientChoice = {
  /** `item:<id>` or `catalog:<id>` — all the row submits; the server resolves it again. */
  ref: string;
  name: string;
  /** A brand or pack, when it tells two entries apart. */
  detail: string | null;
  unit: string;
  imageUrl: string | null;
  /** Already one of the household's items. */
  own: boolean;
};

export type IngredientSearch = (query: string) => Promise<{ ok: true; choices: IngredientChoice[] } | { ok: false }>;

export type IngredientSearchLabels = {
  /** "Use “{name}” as a new item": a name the catalog does not have is still yours to add (rule 20). */
  useTyped: string;
  searching: string;
  /** Beside the household's own items. */
  atHome: string;
};

/**
 * A catalog item is bought by the kilo or the litre; a recipe uses it by the
 * gram or the millilitre. A pick starts the row in the recipe's unit, so
 * "200" under tomatoes is 200 g, never 200 kg.
 */
const RECIPE_UNIT: Readonly<Record<string, string>> = { kg: "g", l: "ml" };

/** Metric units by their symbol: a half-width picker has no room for "kilograms (kg)" (rule 15). */
const SYMBOLS: Readonly<Record<string, string>> = { g: "g", kg: "kg", ml: "ml", l: "L" };

const INPUT = "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]";

/**
 * Ingredients as rows, one raw item each, with how much of it (rule 20: the
 * unit is picked from the grocery list's own units, with its own way to add
 * one that isn't listed). The item takes the row's full width and is never
 * cut (rule 11); the amount and its unit sit as a pair beneath it (rule 19),
 * and the row's remove is an icon with an accessible name. Each row submits
 * `{prefix}Name`, `{prefix}Quantity` and `{prefix}Unit` in the same position,
 * read on the server by `meals/ingredient-lines.ts`'s `ingredientLinesFrom`.
 */
export function IngredientRows({
  prefix,
  labels,
  unitLabels,
  initialRows = 2,
  initial,
  search,
  searchLabels,
  namesOnly = false,
  className,
}: {
  prefix: string;
  labels: IngredientRowsLabels;
  /** The words shown for each unit in the viewer's language; the value submitted is the unit key. */
  unitLabels?: Readonly<Record<string, string>>;
  initialRows?: number;
  /** Rows to start from (a recipe's items when a meal is planned from it); the form reads them like any typed row. Give the component a new `key` to start again. */
  initial?: readonly { name: string; quantity: number | null; unit: string }[];
  /**
   * The grocery catalog and the household's own items (25-017): with it, the
   * item field searches them as the person types, and a pick links the row to
   * that item. Without it the field is plain text, as before.
   */
  search?: IngredientSearch;
  searchLabels?: IngredientSearchLabels;
  /** Items by name only, with no amount (a recipe's nice-to-haves never become a shopping need). Each row still submits an empty amount, in position. */
  namesOnly?: boolean;
  className?: string;
}) {
  const id = useId();
  const unitWords = { ...unitLabels, ...SYMBOLS };
  const start: Row[] =
    initial && initial.length > 0
      ? initial.map((row, key) => ({ key, name: row.name, quantity: row.quantity === null ? "" : String(row.quantity), unit: row.unit }))
      : Array.from({ length: initialRows }, (_, key) => ({ key, name: "" }));
  const [next, setNext] = useState(start.length);
  const [rows, setRows] = useState<Row[]>(() => start);

  const add = () => {
    setRows((current) => [...current, { key: next, name: "" }]);
    setNext((value) => value + 1);
  };
  const remove = (key: number) =>
    setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : [{ key: next, name: "" }]));
  // Typing over a pick unlinks it: the row is then a name, not that item.
  const rename = (key: number, name: string) => setRows((current) => current.map((row) => (row.key === key ? { ...row, name, ref: undefined } : row)));
  const pick = (key: number, choice: IngredientChoice) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, name: choice.name, ref: choice.ref, unit: recipeUnit(choice.unit) ?? row.unit } : row)));

  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className="mb-1.5 block text-sm font-medium">{labels.legend}</legend>
      <ul className="space-y-2">
        {rows.map((row, index) => {
          const nameId = `${id}-${row.key}-name`;
          const amountId = `${id}-${row.key}-amount`;
          return (
            <li key={row.key} className="space-y-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label htmlFor={nameId} className="block text-xs font-medium text-[var(--wh-foreground-muted)]">
                    {labels.item}
                  </label>
                  <input type="hidden" name={`${prefix}Ref`} value={row.ref ?? ""} />
                  {search && searchLabels ? (
                    <CatalogItemField
                      id={nameId}
                      name={`${prefix}Name`}
                      value={row.name}
                      linked={Boolean(row.ref)}
                      onType={(value) => rename(row.key, value)}
                      onPick={(choice) => pick(row.key, choice)}
                      search={search}
                      labels={searchLabels}
                      placeholder={index === 0 ? labels.itemPlaceholder : undefined}
                    />
                  ) : (
                    <input
                      id={nameId}
                      name={`${prefix}Name`}
                      value={row.name}
                      onChange={(event) => rename(row.key, event.target.value)}
                      placeholder={index === 0 ? labels.itemPlaceholder : undefined}
                      autoComplete="off"
                      maxLength={120}
                      className={INPUT}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(row.key)}
                  aria-label={labels.removeRow.replace("{name}", row.name.trim() || labels.thisItem)}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              {namesOnly ? (
                <>
                  <input type="hidden" name={`${prefix}Quantity`} value="" />
                  <input type="hidden" name={`${prefix}Unit`} value="unit" />
                </>
              ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor={amountId} className="block text-xs font-medium text-[var(--wh-foreground-muted)]">
                    {labels.amount}
                  </label>
                  <input id={amountId} name={`${prefix}Quantity`} inputMode="decimal" autoComplete="off" defaultValue={row.quantity ?? ""} className={INPUT} />
                </div>
                <ComboboxField
                  key={`${row.key}-${row.unit ?? "g"}`}
                  label={labels.unit}
                  name={`${prefix}Unit`}
                  options={[...UNIT_CHOICES]}
                  optionLabels={unitWords}
                  defaultValue={row.unit ?? "g"}
                  addNewLabel={labels.addNewUnit}
                  chooseExistingLabel={labels.chooseUnit}
                  className="[&>label]:text-xs [&>label]:text-[var(--wh-foreground-muted)]"
                />
              </div>
              )}
            </li>
          );
        })}
      </ul>
      {namesOnly ? null : <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.hint}</p>}
      <button
        type="button"
        onClick={add}
        disabled={rows.length >= 40}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--wh-radius-pill)] px-2 text-sm font-semibold text-[var(--wh-primary)] hover:underline disabled:opacity-50"
      >
        <Plus aria-hidden className="size-4" /> {labels.addRow}
      </button>
    </fieldset>
  );
}

/** The unit a picked item starts its row in: the recipe-sized one for a bulk unit, its own otherwise, nothing when it is not one of the picker's. */
function recipeUnit(unit: string): string | null {
  const wanted = RECIPE_UNIT[unit] ?? unit;
  return (UNIT_CHOICES as readonly string[]).includes(wanted) ? wanted : null;
}
