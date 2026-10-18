"use client";

import { Lightbulb, Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { IngredientRows, type IngredientRowsLabels } from "@wonderhome/core/ui/ingredient-rows";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  addSuggestedMealAction,
  createMealAction,
  removeMealAction,
  updateMealAction,
  createPreferenceAction,
  createRecipeAction,
  suggestMealAction,
  type RecipeActionState,
  type SuggestMealState,
} from "../(auth)/meal-actions";

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
  fillLater: string;
  backToPicking: string;
  addMeal: string;
  adding: string;
  fromRecipe: string;
  oneOff: string;
  readyToCook: string;
  missingIngredient: string;
  recipeOption: string;
  addNewMeal: string;
  slot: string;
  date: string;
  readyBy: string;
  cook: string;
  nobodyYet: string;
  planSubmit: string;
  planning: string;
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
  rows: Omit<IngredientRowsLabels, "legend">;
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
 * "Plan a meal" as a sheet — the manual half of "Plan with AI". A recipe is
 * optional: picking one links timing and ingredients to the meal.
 *
 * The recipe picker groups what the household can cook right now (every
 * essential ingredient in stock, the same check `suggestMeal`'s "Suggest"
 * button already runs) ahead of what's missing something — the choices are
 * offered based on what's actually available, not a flat alphabetical list,
 * but nothing is hidden: a recipe that's short an ingredient is still one
 * tap away, since WonderHome already turns that shortage into a shopping
 * item once the meal is planned. A final "Add a new meal" option swaps in a
 * compact recipe-creation form (rule 20: a picker always carries its own
 * way to add a value that isn't listed yet); creating it there also makes
 * it selectable for every future "Plan a meal", not just this one.
 */
export function PlanMealButton({
  householdId,
  members,
  recipes = [],
  labels,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  labels: MealFormLabels;
  recipes?: {
    id: string;
    name: string;
    totalMinutes: number;
    serves: number;
    available: boolean;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const [addingMeal, setAddingMeal] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    createMealAction,
    {},
  );
  const [recipeState, recipeFormAction] = useActionState<
    RecipeActionState,
    FormData
  >(createRecipeAction, {});
  const today = new Date().toISOString().slice(0, 10);

  // Once the quick-add recipe form succeeds, `revalidatePath("/meals")`
  // refreshes this sheet's `recipes` prop with the new one already in it —
  // so switching back to the picker is enough; there is nothing further to
  // do to select it, it is simply there now. Adjusted during render (React's
  // own pattern for "reset state when something changes") rather than in an
  // effect, since this is deriving state from a render, not synchronising
  // with an external system.
  const [handledNotice, setHandledNotice] = useState<string | undefined>(
    undefined,
  );
  if (recipeState.notice && recipeState.notice !== handledNotice) {
    setHandledNotice(recipeState.notice);
    setAddingMeal(false);
  }

  const ready = recipes.filter((recipe) => recipe.available);
  const missingSomething = recipes.filter((recipe) => !recipe.available);

  return (
    <>
      <Pill
        type="button"
        tone="soft"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus aria-hidden className="size-3.5" /> {labels.plan}
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={labels.plan}
        description={labels.planDescription}
      >
        {addingMeal ? (
          <form action={recipeFormAction} className="space-y-3">
            {recipeState.error ? <Alert>{recipeState.error}</Alert> : null}
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="activeMinutes" value={20} />
            <input type="hidden" name="totalMinutes" value={40} />
            <input type="hidden" name="serves" value={4} />
            <Field
              label={labels.mealName}
              name="name"
              required
              placeholder={labels.mealPlaceholder}
              autoComplete="off"
            />
            <IngredientRows prefix="essential" labels={{ ...labels.rows, legend: labels.essential }} unitLabels={labels.unitNames} />
            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              {labels.fillLater}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setAddingMeal(false)}
              >
                {labels.backToPicking}
              </Button>
              <Submit label={labels.addMeal} pendingLabel={labels.adding} />
            </div>
          </form>
        ) : (
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field
            label={labels.mealName}
            name="name"
            required
            placeholder={labels.mealPlaceholder}
            autoComplete="off"
          />
          <div className="space-y-1.5">
            <label htmlFor="recipeId" className="block text-sm font-medium">
              {labels.fromRecipe}
            </label>
            <select
              id="recipeId"
              name="recipeId"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value === "__new__") setAddingMeal(true);
              }}
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              <option value="">{labels.oneOff}</option>
              {ready.length > 0 ? (
                <optgroup label={labels.readyToCook}>
                  {ready.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {fill(labels.recipeOption, { name: recipe.name, minutes: recipe.totalMinutes, serves: recipe.serves })}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {missingSomething.length > 0 ? (
                <optgroup label={labels.missingIngredient}>
                  {missingSomething.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {fill(labels.recipeOption, { name: recipe.name, minutes: recipe.totalMinutes, serves: recipe.serves })}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <option value="__new__">{labels.addNewMeal}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="slot" className="block text-sm font-medium">
              {labels.slot}
            </label>
            <select
              id="slot"
              name="slot"
              defaultValue="dinner"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {labels.slots[slot]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={labels.date}
              name="onDate"
              type="date"
              required
              defaultValue={today}
            />
            <Field
              label={labels.readyBy}
              name="readyByTime"
              type="time"
              required
              defaultValue="20:00"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cookMemberId" className="block text-sm font-medium">
              {labels.cook}
            </label>
            <select
              id="cookMemberId"
              name="cookMemberId"
              defaultValue=""
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
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
        )}
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
}: {
  householdId: string;
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
}: {
  householdId: string;
  labels: MealFormLabels;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (recipe: { id: string; name: string }) => void;
}) {
  const [state, formAction] = useActionState<RecipeActionState, FormData>(createRecipeAction, {});
  // A recipe that went through starts the next one on a fresh form (the rows are kept in state), and a caller waiting on it picks it.
  const [handled, setHandled] = useState<string | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);
  if (state.recipeId && state.recipeId !== handled) {
    setHandled(state.recipeId);
    setFormKey((key) => key + 1);
  }
  // Telling the caller is a change in another component, so it waits for the commit.
  const created = state.recipeId ? { id: state.recipeId, name: state.recipeName ?? "" } : null;
  useEffect(() => {
    if (!created || !onCreated) return;
    onCreated(created);
    onOpenChange(false);
    // Once per recipe made; the callbacks are the caller's and may change on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created?.id]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={labels.recipeTitle}
      description={labels.recipeDescription}
    >
      <form key={formKey} action={formAction} className="space-y-3">
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
        <input type="hidden" name="householdId" value={householdId} />
        <Field
          label={labels.recipeName}
          name="name"
          required
          placeholder={labels.mealPlaceholder}
          autoComplete="off"
        />
        <Field
          label={labels.cuisine}
          name="cuisine"
          placeholder={labels.cuisinePlaceholder}
          autoComplete="off"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field
            label={labels.activeMinutes}
            name="activeMinutes"
            type="number"
            min={1}
            required
            defaultValue={20}
          />
          <Field
            label={labels.totalMinutes}
            name="totalMinutes"
            type="number"
            min={1}
            required
            defaultValue={40}
          />
          <Field
            label={labels.serves}
            name="serves"
            type="number"
            min={1}
            required
            defaultValue={4}
          />
        </div>
        <IngredientRows prefix="essential" labels={{ ...labels.rows, legend: labels.essential }} unitLabels={labels.unitNames} />
        <div className="space-y-1.5">
          <label
            htmlFor="optionalIngredients"
            className="block text-sm font-medium"
          >
            {labels.optional}
          </label>
          <textarea
            id="optionalIngredients"
            name="optionalIngredients"
            rows={2}
            placeholder={labels.optionalPlaceholder}
            className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
          />
        </div>
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
          />
          <Field
            label={labels.protein}
            name="proteinGrams"
            type="number"
            min={0}
            placeholder="18"
          />
          <Field
            label={labels.carbs}
            name="carbsGrams"
            type="number"
            min={0}
            placeholder="55"
          />
          <Field
            label={labels.fat}
            name="fatGrams"
            type="number"
            min={0}
            placeholder="12"
          />
        </div>
        <Field
          label={labels.method}
          name="method"
          placeholder={labels.methodPlaceholder}
          autoComplete="off"
        />
        <Submit label={labels.addRecipe} pendingLabel={labels.adding} />
      </form>
    </Sheet>
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
              defaultValue={today}
            />
            <Submit label={labels.check} pendingLabel={labels.checking} />
          </form>

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
        </div>
      </Sheet>
    </>
  );
}
