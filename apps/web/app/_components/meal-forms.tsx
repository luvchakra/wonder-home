"use client";

import { Lightbulb, Pencil, Plus } from "lucide-react";
import { SLOT_READY_BY } from "@wonderhome/core/meals/week";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { IngredientRows, type IngredientRowsLabels, type IngredientSearchLabels } from "@wonderhome/core/ui/ingredient-rows";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { RecipeForEdit } from "@wonderhome/core/meals/repository";

import type { ActionState } from "../(auth)/actions";
import { DishIdeas, type DishIdeaLabels } from "./dish-ideas";
import { RecipePicker, type RecipePickerLabels } from "./recipe-picker";
import type { Diet } from "@wonderhome/core/meals/diet";
import type { PickerDish } from "@wonderhome/core/meals/recipe-picker";
import {
  addSuggestedMealAction,
  createMealAction,
  removeMealAction,
  updateMealAction,
  createPreferenceAction,
  createRecipeAction,
  retireRecipeAction,
  suggestMealAction,
  updateRecipeAction,
  type RecipeActionState,
  type SuggestMealState, catalogDishLinesAction, searchIngredientChoicesAction } from "../(auth)/meal-actions";

const SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;

const PREFERENCE_KINDS = ["preference", "dislike", "allergy", "medical", "ethical"] as const;

/**
 * Every meal sheet's words in the viewer's language, built on the server by
 * `mealFormLabels` (story 22-004). `{name}`, `{minutes}`, `{serves}` and
 * `{items}` stay placeholders and are filled in here; a recipe's name and an
 * ingredient's name are the household's own words and never translated.
 */
export type MealFormLabels = {
  slots: Record<(typeof SLOTS)[number], string>;
  preferenceKinds: Record<(typeof PREFERENCE_KINDS)[number], string>;
  plan: string;
  planDescription: string;
  mealName: string;
  mealPlaceholder: string;
  essential: string;
  essentialPlaceholder: string;
  addMeal: string;
  adding: string;
  fromRecipe: string;
  oneOff: string;
  readyToCook: string;
  missingIngredient: string;
  recipeOption: string;
  slot: string;
  date: string;
  readyBy: string;
  cook: string;
  nobodyYet: string;
  planSubmit: string;
  planning: string;
  /** Where the ingredients written while planning go (25-019). */
  ingredientsFor: string;
  forThisMeal: string;
  /** `{recipe}` is the recipe's name. */
  forRecipeToo: string;
  forNewRecipe: string;
  newRecipeName: string;
  attach: string;
  attachTitle: string;
  change: string;
  changeTitle: string;
  changeDescription: string;
  save: string;
  saving: string;
  remove: string;
  removing: string;
  noRecipe: string;
  writeIngredients: string;
  /** The ingredient rows' words; the legend is the form's own question. */
  rows: Omit<IngredientRowsLabels, "legend"> & { search: IngredientSearchLabels };
  /** Each unit key's name in the viewer's language (the grocery list's own words). */
  unitNames: Record<string, string>;
  saveIngredients: string;
  orRecipe: string;
  useRecipe: string;
  noIngredientsYet: string;
  attachDescription: string;
  whichRecipe: string;
  attachSubmit: string;
  attaching: string;
  addRecipe: string;
  recipeTitle: string;
  recipeDescription: string;
  recipeName: string;
  cuisine: string;
  cuisinePlaceholder: string;
  activeMinutes: string;
  totalMinutes: string;
  serves: string;
  optional: string;
  optionalPlaceholder: string;
  nutrients: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  method: string;
  methodPlaceholder: string;
  addPreference: string;
  preferenceTitle: string;
  preferenceDescription: string;
  who: string;
  wholeHousehold: string;
  kind: string;
  subject: string;
  subjectPlaceholder: string;
  suggest: string;
  suggestTitle: string;
  suggestDescription: string;
  forDay: string;
  check: string;
  checking: string;
  stillNeeds: string;
  runningLow: string;
  addToPlan: string;
  /** Ideas from what is at home (25-018). */
  ideas: DishIdeaLabels;
  /** Changing and removing a household's own recipe (25-022); `{name}` is the recipe's. */
  editRecipe: string;
  editRecipeTitle: string;
  editRecipeDescription: string;
  saveRecipe: string;
  removeRecipe: string;
};

/** Fills a label's `{placeholders}`; a value is inserted as it is, never read as a pattern. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

function Submit({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * "Plan a meal" as a sheet, starting from the recipe (25-019, the owner's
 * order). Picking a recipe fills in the meal's name and every item it needs
 * with its amount; all of it stays editable. Where the written ingredients
 * go is the person's choice: just for this meal (the recipe is untouched),
 * saved to the recipe too, or saved as a new recipe — which is also how a
 * one-off dish becomes a recipe (rule 20's way to add what isn't listed).
 *
 * The picker groups what the household can cook right now (every essential
 * ingredient in stock, the check `suggestMeal` runs) ahead of what is short
 * of something; nothing is hidden, since planning a recipe is what turns a
 * shortage into a shopping item.
 */
export function PlanMealButton({
  householdId,
  members,
  recipes = [],
  dishes = [],
  familyDiet = null,
  people = [],
  pickerLabels,
  labels,
  onDate,
  slot,
  trigger = "pill",
  triggerLabel,
}: {
  /** The slot row's full name for assistive technology: "Plan lunch on Wednesday". */
  triggerLabel?: string;
  householdId: string;
  members: { id: string; displayName: string }[];
  labels: MealFormLabels;
  /** The day and slot it opens on — an empty slot in the week planned straight into. */
  onDate?: string;
  slot?: (typeof SLOTS)[number];
  /** "slot": the quiet "+ Lunch" row of an empty slot in the week; "pill" is the header's Plan a meal. */
  trigger?: "pill" | "slot";
  /** Every recipe the picker offers, the household's own and WonderHome's (`pickerDishes`). */
  dishes?: PickerDish[];
  familyDiet?: Diet | null;
  people?: { name: string; diet: Diet }[];
  pickerLabels: RecipePickerLabels;
  recipes?: {
    id: string;
    name: string;
    totalMinutes: number;
    serves: number;
    available: boolean;
    ingredients: { name: string; quantity: number; unit: string }[];
  }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createMealAction, {});
  const today = new Date().toISOString().slice(0, 10);
  // The recipe comes first (the owner, 2026-10-18): picking one fills in the
  // meal's name and what it needs, and everything stays editable.
  const [recipeId, setRecipeId] = useState("");
  // A WonderHome dish not saved yet: planning it saves it to the household's recipes.
  const [catalog, setCatalog] = useState<{ slug: string; name: string; lines: { name: string; quantity: number; unit: string }[] } | null>(null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [scope, setScope] = useState<"meal" | "recipe" | "new">("meal");
  const recipe = recipes.find((choice) => choice.id === recipeId) ?? (catalog ? { id: "", name: catalog.name, ingredients: catalog.lines } : null);
  const pickedKey = recipeId ? `recipe:${recipeId}` : catalog ? `catalog:${catalog.slug}` : "";
  const select = "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";
  const scopes: { key: "meal" | "recipe" | "new"; label: string }[] = recipe
    ? [
        { key: "meal", label: labels.forThisMeal },
        { key: "recipe", label: fill(labels.forRecipeToo, { recipe: recipe.name }) },
        { key: "new", label: labels.forNewRecipe },
      ]
    : [
        { key: "meal", label: labels.forThisMeal },
        { key: "new", label: labels.forNewRecipe },
      ];

  return (
    <>
      {trigger === "slot" && slot ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={triggerLabel}
          className="flex min-h-11 w-full items-center gap-2 rounded-[var(--wh-radius-sm)] border border-dashed border-[var(--wh-border)] px-3 text-left text-sm text-[var(--wh-foreground-muted)] transition-colors hover:border-[var(--wh-primary)] hover:text-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
        >
          <Plus aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{labels.slots[slot]}</span>
        </button>
      ) : (
        <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
          <Plus aria-hidden className="size-3.5" /> {labels.plan}
        </Pill>
      )}

      <Sheet open={open} onOpenChange={setOpen} title={labels.plan} description={labels.planDescription}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="recipeId" value={recipeId} />
          <input type="hidden" name="catalogSlug" value={catalog?.slug ?? ""} />
          <RecipePicker
            dishes={dishes}
            value={pickedKey}
            familyDiet={familyDiet}
            people={people}
            labels={pickerLabels}
            onChange={async (key) => {
              const own = key.startsWith("recipe:") ? (recipes.find((choice) => `recipe:${choice.id}` === key) ?? null) : null;
              const slug = key.startsWith("catalog:") ? key.slice("catalog:".length) : null;
              const dish = dishes.find((entry) => entry.key === key) ?? null;
              setRecipeId(own?.id ?? "");
              setCatalog(null);
              if (!nameTouched) setName(dish?.name ?? "");
              if (!own && scope === "recipe" && !slug) setScope("meal");
              if (slug && dish) {
                // What the dish needs, from the catalog, to fill the rows below.
                const lines = await catalogDishLinesAction(slug);
                setCatalog({ slug, name: dish.name, lines });
              }
            }}
          />
          <Field
            label={labels.mealName}
            name="name"
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameTouched(true);
            }}
            placeholder={labels.mealPlaceholder}
            autoComplete="off"
          />
          {/* A new key starts the rows again from the recipe just picked. */}
          <IngredientRows
            key={pickedKey || "one-off"}
            prefix="essential"
            initial={recipe?.ingredients}
            labels={{ ...labels.rows, legend: labels.essential }}
            unitLabels={labels.unitNames}
            search={(query) => searchIngredientChoicesAction(householdId, query)}
            searchLabels={labels.rows.search}
          />
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium">{labels.ingredientsFor}</legend>
            {scopes.map((option) => (
              <label key={option.key} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--wh-radius-sm)] px-1 text-sm">
                <input
                  type="radio"
                  name="ingredientsFor"
                  value={option.key}
                  checked={scope === option.key}
                  onChange={() => setScope(option.key)}
                  className="size-4 accent-[var(--wh-primary)]"
                />
                <span className="min-w-0 flex-1">{option.label}</span>
              </label>
            ))}
            {scope === "new" ? (
              <Field
                label={labels.newRecipeName}
                name="newRecipeName"
                required
                defaultValue={recipe ? "" : name}
                key={`new-${recipeId}`}
                autoComplete="off"
              />
            ) : null}
          </fieldset>
          <div className="space-y-1.5">
            <label htmlFor="slot" className="block text-sm font-medium">
              {labels.slot}
            </label>
            <select id="slot" name="slot" defaultValue={slot ?? "dinner"} className={select}>
              {SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {labels.slots[slot]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.date} name="onDate" type="date" required defaultValue={onDate ?? today} />
            <Field label={labels.readyBy} name="readyByTime" type="time" required defaultValue={slot ? SLOT_READY_BY[slot] : "20:00"} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cookMemberId" className="block text-sm font-medium">
              {labels.cook}
            </label>
            <select id="cookMemberId" name="cookMemberId" defaultValue="" className={select}>
              <option value="">{labels.nobodyYet}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </div>
          <Submit label={labels.planSubmit} pendingLabel={labels.planning} />
        </form>
      </Sheet>
    </>
  );
}

/**
 * "Change meal" on a meal's card: the same fields as planning one, changed
 * right here (rule 12), never sent to HomeTalk as a sentence to retype (rule
 * 13). The recipe is one of the fields, so picking or dropping one is part
 * of the same change; "Remove from the plan" sits at the bottom.
 */
export function ChangeMealButton({
  householdId,
  meal,
  members,
  recipes,
  labels,
  compact = false,
}: {
  householdId: string;
  /** An icon with its words for assistive technology, where a text pill would squeeze the meal's name (rule 11). */
  compact?: boolean;
  meal: { id: string; name: string; slot: (typeof SLOTS)[number]; onDate: string; readyByTime: string; cookMemberId: string | null; recipeId: string | null };
  members: { id: string; displayName: string }[];
  recipes: { id: string; name: string }[];
  labels: MealFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(updateMealAction, {});
  const [recipeId, setRecipeId] = useState(meal.recipeId ?? "");
  const [addingRecipe, setAddingRecipe] = useState(false);
  // A recipe made from here is picked at once, listed even before the page's own list refreshes with it.
  const [made, setMade] = useState<{ id: string; name: string } | null>(null);
  const choices = made && !recipes.some((recipe) => recipe.id === made.id) ? [...recipes, made] : recipes;
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [handled, setHandled] = useState<string | undefined>(undefined);
  // A save that went through closes the sheet; the card shows the change.
  if (state.notice && state.notice !== handled) {
    setHandled(state.notice);
    setOpen(false);
  }
  const select = "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";

  return (
    <>
      {compact ? (
        <button
          type="button"
          aria-label={fill(labels.changeTitle, { name: meal.name })}
          title={fill(labels.changeTitle, { name: meal.name })}
          onClick={() => {
            setRecipeId(meal.recipeId ?? "");
            setOpen(true);
          }}
          className="grid size-11 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
        >
          <Pencil aria-hidden className="size-4" />
        </button>
      ) : (
        <Pill
          type="button"
          tone="quiet"
          onClick={() => {
            setRecipeId(meal.recipeId ?? "");
            setOpen(true);
          }}
        >
          {labels.change}
        </Pill>
      )}
      <Sheet open={open} onOpenChange={setOpen} title={fill(labels.changeTitle, { name: meal.name })} description={labels.changeDescription}>
        {open ? (
          <form action={formAction} className="space-y-3">
            {state.error ? <Alert>{state.error}</Alert> : null}
            {removeError ? <Alert>{removeError}</Alert> : null}
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="mealId" value={meal.id} />
            <Field label={labels.mealName} name="name" required defaultValue={meal.name} autoComplete="off" />
            <div className="space-y-1.5">
              <label htmlFor={`recipe-${meal.id}`} className="block text-sm font-medium">
                {labels.fromRecipe}
              </label>
              <select id={`recipe-${meal.id}`} name="recipeId" value={recipeId} onChange={(event) => setRecipeId(event.target.value)} className={select}>
                <option value="">{labels.noRecipe}</option>
                {choices.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </select>
              {recipeId === "" ? (
                <button
                  type="button"
                  onClick={() => setAddingRecipe(true)}
                  className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-[var(--wh-primary)] hover:underline"
                >
                  <Plus aria-hidden className="size-3.5" /> {labels.recipeTitle}
                </button>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`slot-${meal.id}`} className="block text-sm font-medium">
                {labels.slot}
              </label>
              <select id={`slot-${meal.id}`} name="slot" defaultValue={meal.slot} className={select}>
                {SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {labels.slots[slot]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.date} name="onDate" type="date" required defaultValue={meal.onDate} />
              <Field label={labels.readyBy} name="readyByTime" type="time" required defaultValue={meal.readyByTime} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`cook-${meal.id}`} className="block text-sm font-medium">
                {labels.cook}
              </label>
              <select id={`cook-${meal.id}`} name="cookMemberId" defaultValue={meal.cookMemberId ?? ""} className={select}>
                <option value="">{labels.nobodyYet}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </div>
            <Submit label={labels.save} pendingLabel={labels.saving} />
            <Button
              type="button"
              variant="quiet"
              disabled={removing}
              className="w-full"
              onClick={async () => {
                setRemoving(true);
                const result = await removeMealAction({ householdId, mealId: meal.id });
                setRemoving(false);
                if (result.error) setRemoveError(result.error);
                else setOpen(false);
              }}
            >
              {removing ? labels.removing : labels.remove}
            </Button>
          </form>
        ) : null}
      </Sheet>
      {/* Outside the meal's form, so its own form never submits this one. */}
      <AddRecipeSheet
        householdId={householdId}
        labels={labels}
        open={addingRecipe}
        onOpenChange={setAddingRecipe}
        onCreated={(recipe) => {
          setMade(recipe);
          setRecipeId(recipe.id);
        }}
      />
    </>
  );
}

/** "Add recipe" — the Recipes tab's own add form. */
export function AddRecipeButton({ householdId, labels }: { householdId: string; labels: MealFormLabels }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pill
        type="button"
        tone="soft"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus aria-hidden className="size-3.5" /> {labels.addRecipe}
      </Pill>

      <AddRecipeSheet householdId={householdId} labels={labels} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * The recipe form, in its own sheet: each essential ingredient a raw item with
 * how much of it (`IngredientRows`), so a meal planned from it knows what to
 * buy. Opened by the Recipes tab's "Add recipe" and by the "Add a recipe" link
 * under a meal's recipe picker, which picks the new recipe through `onCreated`.
 */
export function AddRecipeSheet({
  householdId,
  labels,
  open,
  onOpenChange,
  onCreated,
  recipe,
}: {
  householdId: string;
  labels: MealFormLabels;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (recipe: { id: string; name: string }) => void;
  /** A recipe already kept: the same form, filled in, saving changes to it (25-022). */
  recipe?: RecipeForEdit;
}) {
  const [state, formAction] = useActionState<RecipeActionState, FormData>(recipe ? updateRecipeAction : createRecipeAction, {});
  // A recipe that went through starts the next one on a fresh form (the rows are kept in state), and a caller waiting on it picks it.
  const [handled, setHandled] = useState<string | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);
  if (!recipe && state.recipeId && state.recipeId !== handled) {
    setHandled(state.recipeId);
    setFormKey((key) => key + 1);
  }
  // Telling the caller is a change in another component, so it waits for the commit.
  const created = !recipe && state.recipeId ? { id: state.recipeId, name: state.recipeName ?? "" } : null;
  useEffect(() => {
    if (!created || !onCreated) return;
    onCreated(created);
    onOpenChange(false);
    // Once per recipe made; the callbacks are the caller's and may change on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created?.id]);
  const optionalRows = recipe?.optional.map((name) => ({ name, quantity: null, unit: "unit" }));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={recipe ? fill(labels.editRecipeTitle, { name: recipe.name }) : labels.recipeTitle}
      description={recipe ? labels.editRecipeDescription : labels.recipeDescription}
    >
      <form key={formKey} action={formAction} className="space-y-3">
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
        <input type="hidden" name="householdId" value={householdId} />
        {recipe ? <input type="hidden" name="recipeId" value={recipe.id} /> : null}
        <Field
          label={labels.recipeName}
          name="name"
          required
          placeholder={labels.mealPlaceholder}
          autoComplete="off"
          defaultValue={recipe?.name}
        />
        <Field
          label={labels.cuisine}
          name="cuisine"
          placeholder={labels.cuisinePlaceholder}
          autoComplete="off"
          defaultValue={recipe?.cuisine ?? undefined}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field
            label={labels.activeMinutes}
            name="activeMinutes"
            type="number"
            min={1}
            required
            defaultValue={recipe?.activeMinutes ?? 20}
          />
          <Field
            label={labels.totalMinutes}
            name="totalMinutes"
            type="number"
            min={1}
            required
            defaultValue={recipe?.totalMinutes ?? 40}
          />
          <Field
            label={labels.serves}
            name="serves"
            type="number"
            min={1}
            required
            defaultValue={recipe?.serves ?? 4}
          />
        </div>
        <IngredientRows
          prefix="essential"
          initial={recipe?.essentials}
          labels={{ ...labels.rows, legend: labels.essential }}
          unitLabels={labels.unitNames}
          search={(query) => searchIngredientChoicesAction(householdId, query)}
          searchLabels={labels.rows.search}
        />
        <IngredientRows
          prefix="optional"
          namesOnly
          initialRows={1}
          initial={optionalRows}
          labels={{ ...labels.rows, legend: labels.optional, itemPlaceholder: labels.optionalPlaceholder }}
          unitLabels={labels.unitNames}
          search={(query) => searchIngredientChoicesAction(householdId, query)}
          searchLabels={labels.rows.search}
        />
        <p className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
          {labels.nutrients}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={labels.calories}
            name="caloriesPerServing"
            type="number"
            min={0}
            placeholder="450"
            defaultValue={recipe?.caloriesPerServing ?? undefined}
          />
          <Field
            label={labels.protein}
            name="proteinGrams"
            type="number"
            min={0}
            placeholder="18"
            defaultValue={recipe?.proteinGrams ?? undefined}
          />
          <Field
            label={labels.carbs}
            name="carbsGrams"
            type="number"
            min={0}
            placeholder="55"
            defaultValue={recipe?.carbsGrams ?? undefined}
          />
          <Field
            label={labels.fat}
            name="fatGrams"
            type="number"
            min={0}
            placeholder="12"
            defaultValue={recipe?.fatGrams ?? undefined}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="method" className="block text-sm font-medium">
            {labels.method}
          </label>
          {/* Steps are kept a line each, so the method is a box of lines, not one line. */}
          <textarea
            id="method"
            name="method"
            rows={4}
            maxLength={4000}
            placeholder={labels.methodPlaceholder}
            defaultValue={recipe?.method ?? undefined}
            className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
          />
        </div>
        <Submit label={recipe ? labels.saveRecipe : labels.addRecipe} pendingLabel={recipe ? labels.saving : labels.adding} />
        {recipe ? (
          <>
            {removeError ? <Alert>{removeError}</Alert> : null}
            <Button
              type="button"
              variant="secondary"
              className="w-full text-[var(--wh-risk)]"
              disabled={removing}
              onClick={async () => {
                setRemoving(true);
                const result = await retireRecipeAction({ householdId, recipeId: recipe.id });
                setRemoving(false);
                if (result.error) setRemoveError(result.error);
                else onOpenChange(false);
              }}
            >
              {removing ? labels.removing : labels.removeRecipe}
            </Button>
          </>
        ) : null}
      </form>
    </Sheet>
  );
}

/** The pencil on a household recipe's card: its own form, filled in (25-022, rule 12). */
export function EditRecipeButton({ householdId, labels, recipe }: { householdId: string; labels: MealFormLabels; recipe: RecipeForEdit }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={fill(labels.editRecipe, { name: recipe.name })}
        className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
      >
        <Pencil aria-hidden className="size-4" />
      </button>
      {open ? <AddRecipeSheet householdId={householdId} labels={labels} open={open} onOpenChange={setOpen} recipe={recipe} /> : null}
    </>
  );
}

/** "Add preference" — the manual half of "Tell WonderHome", covering member, timing and recipe/dish preferences through the same shape. */
export function AddPreferenceButton({
  householdId,
  currentMemberId,
  admin,
  members,
  labels,
}: {
  householdId: string;
  currentMemberId: string;
  admin: boolean;
  members: { id: string; displayName: string }[];
  labels: MealFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    createPreferenceAction,
    {},
  );
  const options = admin
    ? members
    : members.filter((member) => member.id === currentMemberId);

  return (
    <>
      <Pill
        type="button"
        tone="soft"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus aria-hidden className="size-3.5" /> {labels.addPreference}
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={labels.preferenceTitle}
        description={labels.preferenceDescription}
      >
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <div className="space-y-1.5">
            <label htmlFor="memberId" className="block text-sm font-medium">
              {labels.who}
            </label>
            <select
              id="memberId"
              name="memberId"
              defaultValue=""
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              <option value="">{labels.wholeHousehold}</option>
              {options.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="kind" className="block text-sm font-medium">
              {labels.kind}
            </label>
            <select
              id="kind"
              name="kind"
              defaultValue="preference"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {PREFERENCE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {labels.preferenceKinds[kind]}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={labels.subject}
            name="subject"
            required
            placeholder={labels.subjectPlaceholder}
            autoComplete="off"
          />
          <Submit label={labels.addPreference} pendingLabel={labels.adding} />
        </form>
      </Sheet>
    </>
  );
}

/**
 * "Suggest" — checks what the household has and everyone's preferences, and
 * offers one thing to cook with a single click to add it.
 */
export function SuggestMealButton({ householdId, labels }: { householdId: string; labels: MealFormLabels }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<SuggestMealState, FormData>(
    suggestMealAction,
    {},
  );
  const [addState, addAction] = useActionState<ActionState, FormData>(
    addSuggestedMealAction,
    {},
  );
  const today = new Date().toISOString().slice(0, 10);
  const [onDate, setOnDate] = useState(today);

  return (
    <>
      <Pill
        type="button"
        tone="quiet"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Lightbulb aria-hidden className="size-3.5" /> {labels.suggest}
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={labels.suggestTitle}
        description={labels.suggestDescription}
      >
        <div className="space-y-4">
          <form action={formAction} className="space-y-3">
            {state.error ? <Alert>{state.error}</Alert> : null}
            <input type="hidden" name="householdId" value={householdId} />
            <Field
              label={labels.forDay}
              name="onDate"
              type="date"
              required
              value={onDate}
              onChange={(event) => setOnDate(event.target.value)}
            />
            <Submit label={labels.check} pendingLabel={labels.checking} />
          </form>

          {state.noRecipes ? <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.ideas.noRecipes}</p> : null}

          {state.choice ? (
            <div className="rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-4">
              {state.choice.kind === "defer" ? (
                <p className="text-sm text-[var(--wh-foreground-muted)]">
                  {state.choice.because}
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold">
                    {state.choice.recipe.name}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">
                    {state.choice.because}
                  </p>
                  {state.choice.kind !== "cook" &&
                  "missing" in state.choice &&
                  state.choice.missing.length > 0 ? (
                    <p className="mt-2 text-xs text-[var(--wh-attention)]">
                      {fill(labels.stillNeeds, { items: state.choice.missing.join(", ") })}
                    </p>
                  ) : null}
                  {state.lowStock && state.lowStock.length > 0 ? (
                    <p className="mt-2 text-xs text-[var(--wh-attention)]">
                      {fill(labels.runningLow, { items: state.lowStock.join(", ") })}
                    </p>
                  ) : null}
                  {addState.notice ? (
                    <p className="mt-3 text-sm text-[var(--wh-handled)]">
                      {addState.notice}
                    </p>
                  ) : (
                    <form action={addAction} className="mt-3 space-y-2">
                      {addState.error ? <Alert>{addState.error}</Alert> : null}
                      <input
                        type="hidden"
                        name="householdId"
                        value={householdId}
                      />
                      <input
                        type="hidden"
                        name="recipeId"
                        value={state.choice.recipe.id}
                      />
                      <input
                        type="hidden"
                        name="name"
                        value={state.choice.recipe.name}
                      />
                      <input
                        type="hidden"
                        name="onDate"
                        value={state.checkedOn ?? today}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="suggest-slot"
                            className="block text-xs font-medium"
                          >
                            {labels.slot}
                          </label>
                          <select
                            id="suggest-slot"
                            name="slot"
                            defaultValue="dinner"
                            className="block min-h-10 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm"
                          >
                            {SLOTS.map((slot) => (
                              <option key={slot} value={slot}>
                                {labels.slots[slot]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label
                            htmlFor="suggest-time"
                            className="block text-xs font-medium"
                          >
                            {labels.readyBy}
                          </label>
                          <input
                            id="suggest-time"
                            name="readyByTime"
                            type="time"
                            defaultValue="20:00"
                            className="block min-h-10 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm"
                          />
                        </div>
                      </div>
                      <Submit label={labels.addToPlan} pendingLabel={labels.adding} />
                    </form>
                  )}
                </>
              )}
            </div>
          ) : null}

          <DishIdeas
            householdId={householdId}
            onDate={onDate || today}
            labels={labels.ideas}
            slotLabels={labels.slots}
            servesLabel={labels.serves}
            readyByLabel={labels.readyBy}
          />
        </div>
      </Sheet>
    </>
  );
}
