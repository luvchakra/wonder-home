"use client";

import { ChefHat, ChevronDown, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import type { Diet, DietClash, DishDiet } from "@wonderhome/core/meals/diet";
import { dietNotes, filterDishes, NO_FILTER, type PickerDish, type PickerFilter } from "@wonderhome/core/meals/recipe-picker";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

export type RecipePickerLabels = {
  label: string;
  oneOff: string;
  search: string;
  /** "Our diet": what fits the family's diet. */
  fits: string;
  any: string;
  anyCalories: string;
  anyProtein: string;
  dishDiets: Record<DishDiet, string>;
  diets: Record<Diet, string>;
  clashes: Record<DietClash, string>;
  filterDiet: string;
  filterCalories: string;
  filterProtein: string;
  /** `{kcal}`. */
  under: string;
  /** `{grams}`. */
  atLeast: string;
  sort: string;
  sortSuggested: string;
  sortProtein: string;
  sortCalories: string;
  yours: string;
  ready: string;
  missing: string;
  fromWonderHome: string;
  /** `{kcal}`, `{protein}`. */
  nutrition: string;
  /** `{kcal}`. */
  caloriesOnly: string;
  /** `{protein}`. */
  proteinOnly: string;
  notCounted: string;
  /** `{minutes}`, `{serves}`. */
  time: string;
  /** `{name}`, `{diet}`, `{reason}`. */
  notFor: string;
  empty: string;
  /** `{name}`. */
  savedOnPlan: string;
};

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

const CALORIES = [300, 500] as const;

/** One small dropdown of the filter row, with a chevron of its own so the value keeps the room. */
function Compact({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-w-0">
      {children}
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-0.5 size-3 -translate-y-1/2 text-[var(--wh-foreground-subtle)]" />
    </div>
  );
}
const PROTEIN = [10, 20] as const;

/**
 * "From a recipe" in Plan a meal (the owner, 2026-10-20): every recipe —
 * the household's own and WonderHome's — with its picture, calories and
 * protein a serving, and filters for the family's diet, a dish's label,
 * calories and protein. A dish that does not suit someone's own diet says
 * so beside it rather than disappearing. The open list sits in the sheet
 * under its chevron (rule 21), and picking closes it.
 */
export function RecipePicker({
  dishes,
  value,
  onChange,
  familyDiet,
  people,
  labels,
}: {
  dishes: PickerDish[];
  /** A dish key, or "" for a one-off dish. */
  value: string;
  onChange: (key: string) => void;
  familyDiet: Diet | null;
  /** Each person with a diet of their own, by name. */
  people: { name: string; diet: Diet }[];
  labels: RecipePickerLabels;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<PickerFilter>({ ...NO_FILTER, fits: familyDiet });
  const chosen = dishes.find((dish) => dish.key === value) ?? null;
  const shown = useMemo(() => filterDishes(dishes, filter), [dishes, filter]);

  const nutrition = (dish: PickerDish) =>
    dish.caloriesPerServing !== null && dish.proteinGrams !== null
      ? fill(labels.nutrition, { kcal: Math.round(dish.caloriesPerServing), protein: Math.round(dish.proteinGrams) })
      : dish.caloriesPerServing !== null
        ? fill(labels.caloriesOnly, { kcal: Math.round(dish.caloriesPerServing) })
        : dish.proteinGrams !== null
          ? fill(labels.proteinOnly, { protein: Math.round(dish.proteinGrams) })
          : labels.notCounted;

  const picture = (dish: PickerDish | null, size: "sm" | "md") =>
    dish?.imageUrl ? (
      // The catalog's own copy of a Commons picture, already sized.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={dish.imageUrl} alt="" loading="lazy" className={`${size === "md" ? "size-14" : "size-10"} shrink-0 rounded-[var(--wh-radius-sm)] object-cover`} />
    ) : (
      <IconTile icon={ChefHat} tone="meals" size={size === "md" ? "md" : "sm"} />
    );

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <span id="recipe-picker-label" className="block text-sm font-medium">
        {labels.label}
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="recipe-picker-list"
        aria-labelledby="recipe-picker-label recipe-picker-chosen"
        onClick={() => setOpen((now) => !now)}
        className="flex min-h-12 w-full items-center gap-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
      >
        {chosen ? picture(chosen, "sm") : null}
        <span id="recipe-picker-chosen" className="min-w-0 flex-1 text-base break-words">
          {chosen ? chosen.name : labels.oneOff}
        </span>
        <ChevronDown aria-hidden className={`size-5 shrink-0 text-[var(--wh-foreground-subtle)] transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {chosen && !chosen.mine ? <p className="text-xs text-[var(--wh-foreground-muted)]">{fill(labels.savedOnPlan, { name: chosen.name })}</p> : null}

      {open ? (
        <div id="recipe-picker-list" className="space-y-2.5 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-2">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--wh-foreground-subtle)]" />
            <input
              type="search"
              aria-label={labels.search}
              placeholder={labels.search}
              value={filter.query}
              onChange={(event) => setFilter((now) => ({ ...now, query: event.target.value }))}
              className="block min-h-10 w-full rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] pr-3 pl-9 text-base"
            />
          </div>

          {/* One row of small dropdowns (the owner, 2026-10-20): diet, calories, protein, order. */}
          <div className="grid grid-cols-4 gap-1">
            <Compact>
              <select
                aria-label={labels.filterDiet}
                value={filter.fits ? "fits" : filter.dishDiet}
                onChange={(event) => {
                  const next = event.target.value;
                  setFilter((now) => ({ ...now, fits: next === "fits" ? familyDiet : null, dishDiet: next === "fits" ? "any" : (next as DishDiet | "any") }));
                }}
                className="min-h-10 w-full min-w-0 appearance-none rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-1 pr-3.5 pl-1.5 text-[0.6875rem] font-medium"
              >
                {familyDiet ? <option value="fits">{labels.fits}</option> : null}
                <option value="any">{labels.any}</option>
                <option value="veg">{labels.dishDiets.veg}</option>
                <option value="egg">{labels.dishDiets.egg}</option>
                <option value="non_veg">{labels.dishDiets.non_veg}</option>
              </select>
            </Compact>
            <Compact>
              <select
                aria-label={labels.filterCalories}
                value={filter.maxCalories === null ? "any" : String(filter.maxCalories)}
                onChange={(event) => setFilter((now) => ({ ...now, maxCalories: event.target.value === "any" ? null : Number(event.target.value) }))}
                className="min-h-10 w-full min-w-0 appearance-none rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-1 pr-3.5 pl-1.5 text-[0.6875rem] font-medium"
              >
                <option value="any">{labels.anyCalories}</option>
                {CALORIES.map((kcal) => (
                  <option key={kcal} value={kcal}>
                    {fill(labels.under, { kcal })}
                  </option>
                ))}
              </select>
            </Compact>
            <Compact>
              <select
                aria-label={labels.filterProtein}
                value={filter.minProtein === null ? "any" : String(filter.minProtein)}
                onChange={(event) => setFilter((now) => ({ ...now, minProtein: event.target.value === "any" ? null : Number(event.target.value) }))}
                className="min-h-10 w-full min-w-0 appearance-none rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-1 pr-3.5 pl-1.5 text-[0.6875rem] font-medium"
              >
                <option value="any">{labels.anyProtein}</option>
                {PROTEIN.map((grams) => (
                  <option key={grams} value={grams}>
                    {fill(labels.atLeast, { grams })}
                  </option>
                ))}
              </select>
            </Compact>
            <Compact>
              <select
                aria-label={labels.sort}
                value={filter.sort}
                onChange={(event) => setFilter((now) => ({ ...now, sort: event.target.value as PickerFilter["sort"] }))}
                className="min-h-10 w-full min-w-0 appearance-none rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-1 pr-3.5 pl-1.5 text-[0.6875rem] font-medium"
              >
                <option value="suggested">{labels.sortSuggested}</option>
                <option value="protein">{labels.sortProtein}</option>
                <option value="calories">{labels.sortCalories}</option>
              </select>
            </Compact>
          </div>

          <ul role="listbox" aria-labelledby="recipe-picker-label" className="divide-y divide-[var(--wh-border)] overflow-hidden rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface)]">
            <li role="option" aria-selected={value === ""}>
              <button type="button" onClick={() => pick("")} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--wh-surface-muted)]">
                {labels.oneOff}
              </button>
            </li>
            {shown.map((dish) => {
              const notes = dietNotes(dish, people);
              return (
                <li key={dish.key} role="option" aria-selected={value === dish.key}>
                  <button
                    type="button"
                    onClick={() => pick(dish.key)}
                    className={`flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--wh-surface-muted)] ${value === dish.key ? "bg-[var(--wh-primary-soft)]" : ""}`}
                  >
                    {picture(dish, "md")}
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block text-[0.9375rem] leading-snug font-semibold break-words">{dish.name}</span>
                      <span className="block text-xs text-[var(--wh-foreground-muted)]">
                        {dish.mine ? `${labels.yours} · ${dish.ready ? labels.ready : labels.missing}` : labels.fromWonderHome} · {labels.dishDiets[dish.diet]}
                      </span>
                      <span className="block text-xs font-medium">{nutrition(dish)}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{fill(labels.time, { minutes: dish.minutes, serves: dish.serves })}</span>
                      {notes.map((note) => (
                        <span key={note.name} className="block text-xs text-[var(--wh-attention)]">
                          {fill(labels.notFor, { name: note.name, diet: labels.diets[note.diet], reason: labels.clashes[note.clash] })}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 ? <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.empty}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
