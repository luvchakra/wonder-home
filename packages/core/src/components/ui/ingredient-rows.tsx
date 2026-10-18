"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { UNIT_CHOICES } from "../../commerce/units";
import { cn } from "../../lib/cn";
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

type Row = { key: number; name: string };

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
  className,
}: {
  prefix: string;
  labels: IngredientRowsLabels;
  /** The words shown for each unit in the viewer's language; the value submitted is the unit key. */
  unitLabels?: Readonly<Record<string, string>>;
  initialRows?: number;
  className?: string;
}) {
  const id = useId();
  const unitWords = { ...unitLabels, ...SYMBOLS };
  const [next, setNext] = useState(initialRows);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: initialRows }, (_, key) => ({ key, name: "" })));

  const add = () => {
    setRows((current) => [...current, { key: next, name: "" }]);
    setNext((value) => value + 1);
  };
  const remove = (key: number) =>
    setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : [{ key: next, name: "" }]));
  const rename = (key: number, name: string) => setRows((current) => current.map((row) => (row.key === key ? { ...row, name } : row)));

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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor={amountId} className="block text-xs font-medium text-[var(--wh-foreground-muted)]">
                    {labels.amount}
                  </label>
                  <input id={amountId} name={`${prefix}Quantity`} inputMode="decimal" autoComplete="off" className={INPUT} />
                </div>
                <ComboboxField
                  label={labels.unit}
                  name={`${prefix}Unit`}
                  options={[...UNIT_CHOICES]}
                  optionLabels={unitWords}
                  defaultValue="g"
                  addNewLabel={labels.addNewUnit}
                  chooseExistingLabel={labels.chooseUnit}
                  className="[&>label]:text-xs [&>label]:text-[var(--wh-foreground-muted)]"
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.hint}</p>
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

