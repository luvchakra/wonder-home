"use client";

import { ShoppingBasket } from "lucide-react";
import { useState, useTransition } from "react";

import type { GroceryItem } from "@wonderhome/core/commerce/inventory";
import type { IngredientNeed } from "@wonderhome/core/meals/meals";
import { mealShortfalls, servingScale, type ShortfallLine } from "@wonderhome/core/meals/shortfall";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Pill, PillLink } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { addMealShortfallsAction } from "../(auth)/meal-actions";
import type { GroceryWords } from "../_lib/grocery-words";
import { fill, newKey, pluralOf, sayAmount } from "../groceries/_components/amounts";

export type MealIngredientsLabels = {
  trigger: string;
  title: string;
  lede: string;
  servings: string;
  servingsHint: string;
  needs: string;
  have: string;
  haveUnknown: string;
  onList: string;
  add: string;
  estimate: string;
  unmeasured: string;
  covered: string;
  none: string;
  noIngredients: string;
  open: string;
  failed: string;
  addAll: Record<string, string>;
  added: Record<string, string>;
};

/**
 * A meal's ingredients, as what to buy (HomeFood 25-003a, design §3.5):
 * only the shortfalls — what the meal needs at the servings planned, less what
 * is at home and what is already on the list — and one action, **Add n to the
 * list**. The numbers move as the servings change, worked out here by the
 * same pure function the server runs again before anything is added.
 */
export function MealIngredientsSheet({
  householdId,
  mealId,
  ingredients,
  groceries,
  recipeServes,
  servings,
  words,
  labels,
}: {
  householdId: string;
  mealId: string;
  ingredients: IngredientNeed[];
  groceries: GroceryItem[];
  recipeServes: number | null;
  servings: number | null;
  words: Pick<GroceryWords, "language" | "unitWords">;
  labels: MealIngredientsLabels;
}) {
  const [open, setOpen] = useState(false);
  const [planned, setPlanned] = useState<number | null>(servings ?? recipeServes);
  const [result, setResult] = useState<{ added: number } | { error: true } | null>(null);
  const [pending, startTransition] = useTransition();

  const plan = mealShortfalls({ ingredients, scale: servingScale(planned, recipeServes), groceries });
  const say = (amount: { quantity: number; unit: string }) => sayAmount(words, amount);
  const choices = [...new Set([...Array.from({ length: 12 }, (_, index) => index + 1), ...(planned && planned > 12 ? [planned] : [])])];

  const describe = (line: ShortfallLine) =>
    [
      line.need ? fill(labels.needs, { amount: say(line.need) }) : null,
      line.have ? fill(labels.have, { amount: say(line.have) }) : labels.haveUnknown,
      line.onList ? fill(labels.onList, { amount: say(line.onList) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const add = () => {
    setResult(null);
    startTransition(async () => {
      const done = await addMealShortfallsAction({ householdId, mealId, servings: recipeServes ? planned : null, key: newKey("meal") });
      setResult("added" in done ? { added: done.added } : { error: true });
    });
  };

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)}>
        <ShoppingBasket aria-hidden className="size-3.5" /> {labels.trigger}
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title={labels.title} description={labels.lede}>
        <div className="space-y-4">
          {recipeServes ? (
            <div className="space-y-1">
              <Select
                label={labels.servings}
                name="servings"
                value={String(planned ?? recipeServes)}
                onChange={(event) => {
                  setPlanned(Number(event.target.value));
                  setResult(null);
                }}
              >
                {choices.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-[var(--wh-foreground-subtle)]">{fill(labels.servingsHint, { count: recipeServes })}</p>
            </div>
          ) : null}

          {ingredients.length === 0 ? (
            <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.noIngredients}</p>
          ) : plan.short.length === 0 ? (
            <p className="text-sm text-[var(--wh-handled)]">{labels.none}</p>
          ) : (
            <ul className="divide-y divide-[var(--wh-border)]">
              {plan.short.map((line) => (
                <li key={line.name} className="flex items-start gap-3 py-2.5">
                  <IconTile icon={ShoppingBasket} tone="meals" size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-[var(--wh-foreground-muted)]">{describe(line)}</p>
                    {line.basis !== "measured" ? (
                      <p className="text-xs text-[var(--wh-foreground-subtle)]">{line.need ? labels.estimate : labels.unmeasured}</p>
                    ) : null}
                  </div>
                  {line.short ? <p className="shrink-0 text-sm font-semibold">{fill(labels.add, { amount: say(line.short) })}</p> : null}
                </li>
              ))}
            </ul>
          )}

          {plan.covered.length > 0 ? (
            <p className="text-xs text-[var(--wh-foreground-subtle)]">{fill(labels.covered, { names: plan.covered.map((line) => line.name).join(", ") })}</p>
          ) : null}

          {result && "error" in result ? <Alert>{labels.failed}</Alert> : null}
          {result && "added" in result ? (
            <div className="flex flex-wrap items-center gap-2" role="status">
              <p className="text-sm text-[var(--wh-handled)]">{pluralOf(words.language, labels.added, result.added)}</p>
              <PillLink href="/groceries?view=to-buy" tone="quiet">
                {labels.open}
              </PillLink>
            </div>
          ) : null}

          {plan.short.length > 0 ? (
            <Button type="button" className="w-full" disabled={pending} onClick={add}>
              {pluralOf(words.language, labels.addAll, plan.short.length)}
            </Button>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
