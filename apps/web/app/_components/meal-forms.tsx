"use client";

import { ChefHat, Lightbulb, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  addSuggestedMealAction,
  attachRecipeToMealAction,
  createMealAction,
  createPreferenceAction,
  createRecipeAction,
  suggestMealAction,
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
    ActionState,
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
            <div className="space-y-1.5">
              <label
                htmlFor="essentialIngredients"
                className="block text-sm font-medium"
              >
                {labels.essential}
              </label>
              <textarea
                id="essentialIngredients"
                name="essentialIngredients"
                rows={3}
                placeholder={labels.essentialPlaceholder}
                className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
              />
            </div>
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

/** Attaching an existing recipe to a meal that was planned without one — a meal card's own "add a recipe". */
export function AttachRecipeControl({
  householdId,
  mealId,
  recipes,
  labels,
}: {
  householdId: string;
  mealId: string;
  recipes: { id: string; name: string }[];
  labels: MealFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    attachRecipeToMealAction,
    {},
  );

  if (recipes.length === 0) return null;

  return (
    <>
      <Pill
        type="button"
        tone="quiet"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <ChefHat aria-hidden className="size-3.5" /> {labels.attach}
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={labels.attachTitle}
        description={labels.attachDescription}
      >
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="mealId" value={mealId} />
          <div className="space-y-1.5">
            <label
              htmlFor={`recipe-${mealId}`}
              className="block text-sm font-medium"
            >
              {labels.whichRecipe}
            </label>
            <select
              id={`recipe-${mealId}`}
              name="recipeId"
              defaultValue={recipes[0]?.id}
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
          </div>
          <Submit label={labels.attachSubmit} pendingLabel={labels.attaching} />
        </form>
      </Sheet>
    </>
  );
}

/** "Add recipe" — the Recipes tab's own add form. Ingredients are kept to a name-per-line list; a household can refine quantities later. */
export function AddRecipeButton({ householdId, labels }: { householdId: string; labels: MealFormLabels }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    createRecipeAction,
    {},
  );

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

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={labels.recipeTitle}
        description={labels.recipeDescription}
      >
        <form action={formAction} className="space-y-3">
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
          <div className="grid grid-cols-3 gap-3">
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
          <div className="space-y-1.5">
            <label
              htmlFor="essentialIngredients"
              className="block text-sm font-medium"
            >
              {labels.essential}
            </label>
            <textarea
              id="essentialIngredients"
              name="essentialIngredients"
              rows={3}
              placeholder={labels.essentialPlaceholder}
              className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
            />
          </div>
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
