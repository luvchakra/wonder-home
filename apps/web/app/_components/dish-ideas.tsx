"use client";

import { ChefHat, Sparkles } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import type { DishIdea } from "@wonderhome/core/meals/dish-ideas";

import { applyDishIdeaAction, suggestDishIdeasAction, type ApplyDishIdeaState } from "../(auth)/dish-idea-actions";

export type DishIdeaLabels = {
  title: string;
  lede: string;
  button: string;
  loading: string;
  atHome: string;
  kept: string;
  toBuy: string;
  planIt: string;
  saveRecipe: string;
  alsoSave: string;
  howTo: string;
  /** "{minutes} min · serves {serves}" */
  timeServes: string;
  noRecipes: string;
  forSlot: string;
};

const SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;
type Slot = (typeof SLOTS)[number];
/** When each meal is usually ready, as a starting point the person changes. */
const READY_BY: Record<Slot, string> = { breakfast: "08:00", lunch: "13:00", snack: "17:00", dinner: "20:00" };

const SELECT = "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-base";

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/**
 * Ideas for a meal from what is at home (story 25-018): up to three dishes a
 * model proposed and the rules checked against the record. Each opens (rule
 * 21) to its ingredients, each marked at home, to check or to buy, and can
 * be planned, saved as a recipe, or both.
 */
export function DishIdeas({
  householdId,
  onDate,
  labels,
  slotLabels,
  servesLabel,
  readyByLabel,
}: {
  householdId: string;
  onDate: string;
  labels: DishIdeaLabels;
  slotLabels: Record<Slot, string>;
  servesLabel: string;
  readyByLabel: string;
}) {
  const [slot, setSlot] = useState<Slot>("dinner");
  const [serves, setServes] = useState(4);
  const [ideas, setIdeas] = useState<DishIdea[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ask = () =>
    startTransition(async () => {
      setMessage(null);
      const reply = await suggestDishIdeasAction({ householdId, slot, serves });
      if (reply.ok) setIdeas(reply.ideas);
      else {
        setIdeas(null);
        setMessage(reply.message);
      }
    });

  return (
    <section aria-labelledby="dish-ideas-title" className="space-y-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} tone="ai" size="sm" />
        <div className="min-w-0">
          <h3 id="dish-ideas-title" className="text-sm font-semibold">
            {labels.title}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{labels.lede}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="dish-ideas-slot" className="block text-xs font-medium">
            {labels.forSlot}
          </label>
          <select id="dish-ideas-slot" value={slot} onChange={(event) => setSlot(event.target.value as Slot)} className={SELECT}>
            {SLOTS.map((value) => (
              <option key={value} value={value}>
                {slotLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="dish-ideas-serves" className="block text-xs font-medium">
            {servesLabel}
          </label>
          <input
            id="dish-ideas-serves"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={serves}
            onChange={(event) => setServes(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
            className={SELECT}
          />
        </div>
      </div>
      <Button type="button" onClick={ask} disabled={pending} className="w-full">
        {pending ? labels.loading : labels.button}
      </Button>
      {message ? (
        <p role="status" className="text-sm text-[var(--wh-foreground-muted)]">
          {message}
        </p>
      ) : null}
      {ideas && ideas.length > 0 ? (
        <ul className="divide-y divide-[var(--wh-border)]" aria-live="polite">
          {ideas.map((idea) => (
            <IdeaRow key={idea.name} idea={idea} householdId={householdId} onDate={onDate} slot={slot} labels={labels} readyByLabel={readyByLabel} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function IdeaRow({
  idea,
  householdId,
  onDate,
  slot,
  labels,
  readyByLabel,
}: {
  idea: DishIdea;
  householdId: string;
  onDate: string;
  slot: Slot;
  labels: DishIdeaLabels;
  readyByLabel: string;
}) {
  const [state, action] = useActionState<ApplyDishIdeaState, FormData>(applyDishIdeaAction, {});
  const [alsoSave, setAlsoSave] = useState(false);
  const payload = JSON.stringify({
    name: idea.name,
    cuisine: idea.cuisine,
    totalMinutes: idea.totalMinutes,
    serves: idea.serves,
    method: idea.method,
    ingredients: idea.ingredients.map((ingredient) => ({ name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit, consumableId: ingredient.consumableId })),
  });
  const badge = (status: DishIdea["ingredients"][number]["status"]) =>
    status === "at_home" ? <Badge tone="handled">{labels.atHome}</Badge> : status === "kept" ? <Badge tone="neutral">{labels.kept}</Badge> : <Badge tone="attention">{labels.toBuy}</Badge>;

  return (
    <ExpandableRow
      summary={
        <span className="flex min-w-0 flex-1 items-start gap-3">
          <IconTile icon={ChefHat} tone="meals" size="sm" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{idea.name}</span>
            <span className="block text-xs text-[var(--wh-foreground-muted)]">{idea.why}</span>
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">{fill(labels.timeServes, { minutes: idea.totalMinutes, serves: idea.serves })}</span>
          </span>
        </span>
      }
    >
      <div className="space-y-3 px-2 pb-3">
        <ul className="space-y-1.5">
          {idea.ingredients.map((ingredient) => (
            <li key={ingredient.name} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {ingredient.name}
                {ingredient.quantity !== null ? <span className="text-[var(--wh-foreground-muted)]"> · {ingredient.quantity} {ingredient.unit}</span> : null}
              </span>
              {badge(ingredient.status)}
            </li>
          ))}
        </ul>
        {idea.method ? (
          <div>
            <p className="text-xs font-semibold">{labels.howTo}</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-[var(--wh-foreground-muted)]">{idea.method}</p>
          </div>
        ) : null}
        {state.notice ? (
          <p role="status" className="text-sm text-[var(--wh-handled)]">
            {state.notice}
          </p>
        ) : (
          <>
            {state.error ? <Alert>{state.error}</Alert> : null}
            <form action={action} className="space-y-2">
              <input type="hidden" name="householdId" value={householdId} />
              <input type="hidden" name="idea" value={payload} />
              <input type="hidden" name="onDate" value={onDate} />
              <input type="hidden" name="slot" value={slot} />
              <input type="hidden" name="use" value={alsoSave ? "both" : "plan"} />
              <div className="space-y-1.5">
                <label htmlFor={`ready-${idea.name}`} className="block text-xs font-medium">
                  {readyByLabel}
                </label>
                <input id={`ready-${idea.name}`} name="readyByTime" type="time" defaultValue={READY_BY[slot]} className={SELECT} />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={alsoSave} onChange={(event) => setAlsoSave(event.target.checked)} className="size-4 accent-[var(--wh-primary)]" />
                {labels.alsoSave}
              </label>
              <SubmitButton label={labels.planIt} />
            </form>
            {alsoSave ? null : (
              <form action={action}>
                <input type="hidden" name="householdId" value={householdId} />
                <input type="hidden" name="idea" value={payload} />
                <input type="hidden" name="use" value="recipe" />
                <SubmitButton label={labels.saveRecipe} quiet />
              </form>
            )}
          </>
        )}
      </div>
    </ExpandableRow>
  );
}

function SubmitButton({ label, quiet = false }: { label: string; quiet?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={quiet ? "secondary" : undefined} className="w-full">
      {label}
    </Button>
  );
}
