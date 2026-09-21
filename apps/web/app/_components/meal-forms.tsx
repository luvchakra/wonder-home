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

const SLOTS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "snack", label: "Snack" },
  { value: "dinner", label: "Dinner" },
];

const PREFERENCE_KINDS = [
  { value: "preference", label: "Preference (timing, style)" },
  { value: "dislike", label: "Dislike" },
  { value: "allergy", label: "Allergy" },
  { value: "medical", label: "Medical" },
  { value: "ethical", label: "Ethical (won't eat)" },
];

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

/** "Plan a meal" as a sheet — the manual half of "Plan with AI". A recipe is optional: picking one links timing and ingredients to the meal. */
export function PlanMealButton({
  householdId,
  members,
  recipes = [],
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  recipes?: {
    id: string;
    name: string;
    totalMinutes: number;
    serves: number;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    createMealAction,
    {},
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Pill
        type="button"
        tone="soft"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus aria-hidden className="size-3.5" /> Plan a meal
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Plan a meal"
        description="WonderHome checks the ingredients and everyone's preferences against it from here."
      >
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field
            label="What's the meal?"
            name="name"
            required
            placeholder="Rajma chawal"
            autoComplete="off"
          />
          {recipes.length > 0 ? (
            <div className="space-y-1.5">
              <label htmlFor="recipeId" className="block text-sm font-medium">
                From a recipe (optional)
              </label>
              <select
                id="recipeId"
                name="recipeId"
                defaultValue=""
                className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
              >
                <option value="">None — a one-off dish</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name} · {recipe.totalMinutes} min · serves{" "}
                    {recipe.serves}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label htmlFor="slot" className="block text-sm font-medium">
              Slot
            </label>
            <select
              id="slot"
              name="slot"
              defaultValue="dinner"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {SLOTS.map((slot) => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Date"
              name="onDate"
              type="date"
              required
              defaultValue={today}
            />
            <Field
              label="Ready by"
              name="readyByTime"
              type="time"
              required
              defaultValue="20:00"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cookMemberId" className="block text-sm font-medium">
              Who’s cooking (optional)
            </label>
            <select
              id="cookMemberId"
              name="cookMemberId"
              defaultValue=""
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              <option value="">Nobody yet</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </div>
          <Submit label="Plan meal" pendingLabel="Planning…" />
        </form>
      </Sheet>
    </>
  );
}

/** Attaching an existing recipe to a meal that was planned without one — a meal card's own "add a recipe". */
export function AttachRecipeControl({
  householdId,
  mealId,
  recipes,
}: {
  householdId: string;
  mealId: string;
  recipes: { id: string; name: string }[];
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
        <ChefHat aria-hidden className="size-3.5" /> Add a recipe
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Add a recipe to this meal"
        description="Copies the recipe's ingredients and timing onto it."
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
              Which recipe?
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
          <Submit label="Attach" pendingLabel="Attaching…" />
        </form>
      </Sheet>
    </>
  );
}

/** "Add recipe" — the Recipes tab's own add form. Ingredients are kept to a name-per-line list; a household can refine quantities later. */
export function AddRecipeButton({ householdId }: { householdId: string }) {
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
        <Plus aria-hidden className="size-3.5" /> Add recipe
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Add a recipe"
        description="Once added, it's there to pick next time you plan a meal."
      >
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field
            label="What's it called?"
            name="name"
            required
            placeholder="Rajma chawal"
            autoComplete="off"
          />
          <Field
            label="Cuisine (optional)"
            name="cuisine"
            placeholder="North Indian"
            autoComplete="off"
          />
          <div className="grid grid-cols-3 gap-3">
            <Field
              label="Active min"
              name="activeMinutes"
              type="number"
              min={1}
              required
              defaultValue={20}
            />
            <Field
              label="Total min"
              name="totalMinutes"
              type="number"
              min={1}
              required
              defaultValue={40}
            />
            <Field
              label="Serves"
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
              Essential ingredients (one per line)
            </label>
            <textarea
              id="essentialIngredients"
              name="essentialIngredients"
              rows={3}
              placeholder={"Rajma\nOnion\nTomato"}
              className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="optionalIngredients"
              className="block text-sm font-medium"
            >
              Nice to have (optional, one per line)
            </label>
            <textarea
              id="optionalIngredients"
              name="optionalIngredients"
              rows={2}
              placeholder={"Coriander"}
              className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
            />
          </div>
          <p className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
            Rough nutrients per serving (optional)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Calories"
              name="caloriesPerServing"
              type="number"
              min={0}
              placeholder="450"
            />
            <Field
              label="Protein (g)"
              name="proteinGrams"
              type="number"
              min={0}
              placeholder="18"
            />
            <Field
              label="Carbs (g)"
              name="carbsGrams"
              type="number"
              min={0}
              placeholder="55"
            />
            <Field
              label="Fat (g)"
              name="fatGrams"
              type="number"
              min={0}
              placeholder="12"
            />
          </div>
          <Field
            label="How to cook it (optional)"
            name="method"
            placeholder="Soak, pressure-cook, temper…"
            autoComplete="off"
          />
          <Submit label="Add recipe" pendingLabel="Adding…" />
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
}: {
  householdId: string;
  currentMemberId: string;
  admin: boolean;
  members: { id: string; displayName: string }[];
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
        <Plus aria-hidden className="size-3.5" /> Add preference
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Add a preference"
        description="A member's own like or dislike, a timing preference, or a household rule — allergies always win over everything else."
      >
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <div className="space-y-1.5">
            <label htmlFor="memberId" className="block text-sm font-medium">
              Who&apos;s this about?
            </label>
            <select
              id="memberId"
              name="memberId"
              defaultValue=""
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              <option value="">Whole household</option>
              {options.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="kind" className="block text-sm font-medium">
              Kind
            </label>
            <select
              id="kind"
              name="kind"
              defaultValue="preference"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {PREFERENCE_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="What is it?"
            name="subject"
            required
            placeholder="Dinner at 8pm, mushrooms, peanuts…"
            autoComplete="off"
          />
          <Submit label="Add preference" pendingLabel="Adding…" />
        </form>
      </Sheet>
    </>
  );
}

/**
 * "Suggest" — checks what the household has and everyone's preferences, and
 * offers one thing to cook with a single click to add it.
 */
export function SuggestMealButton({ householdId }: { householdId: string }) {
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
        <Lightbulb aria-hidden className="size-3.5" /> Suggest
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Suggest a meal"
        description="Checked against what the household has and everyone's preferences."
      >
        <div className="space-y-4">
          <form action={formAction} className="space-y-3">
            {state.error ? <Alert>{state.error}</Alert> : null}
            <input type="hidden" name="householdId" value={householdId} />
            <Field
              label="For which day?"
              name="onDate"
              type="date"
              required
              defaultValue={today}
            />
            <Submit label="Check" pendingLabel="Checking…" />
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
                      Still needs: {state.choice.missing.join(", ")}
                    </p>
                  ) : null}
                  {state.lowStock && state.lowStock.length > 0 ? (
                    <p className="mt-2 text-xs text-[var(--wh-attention)]">
                      Running low: {state.lowStock.join(", ")} — worth
                      restocking soon.
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
                            Slot
                          </label>
                          <select
                            id="suggest-slot"
                            name="slot"
                            defaultValue="dinner"
                            className="block min-h-10 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm"
                          >
                            {SLOTS.map((slot) => (
                              <option key={slot.value} value={slot.value}>
                                {slot.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label
                            htmlFor="suggest-time"
                            className="block text-xs font-medium"
                          >
                            Ready by
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
                      <Submit label="Add to the plan" pendingLabel="Adding…" />
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
