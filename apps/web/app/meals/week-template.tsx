"use client";

import { CalendarDays, Pencil, Plus, Shuffle, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { Diet } from "@wonderhome/core/meals/diet";
import type { MealSlot } from "@wonderhome/core/meals/meals";
import type { PickerDish } from "@wonderhome/core/meals/recipe-picker";
import type { TemplateOption, Weekday } from "@wonderhome/core/meals/week-template";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Pill, PillLink } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";
import { EmptyState } from "@wonderhome/core/ui/states";

import {
  addTemplateOptionAction,
  chooseAgainAction,
  planWeekFromTemplateAction,
  removeTemplateOptionAction,
  updateTemplateOptionAction,
} from "../(auth)/meal-template-actions";
import { RecipePicker, type RecipePickerLabels } from "../_components/recipe-picker";

/**
 * The week template on Meals & Cooking (the owner, 2026-10-20): for each
 * day's meals, a few dishes WonderHome may pick from. Each week it picks one
 * per meal and plans it — accepted by default — and a person changes any
 * pick on the Plan tab or asks it to choose again.
 */

export type WeekTemplateLabels = {
  title: string;
  lede: string;
  add: string;
  addTitle: string;
  addLede: string;
  editTitle: string;
  days: string;
  every: string;
  weekdays: string;
  weekend: string;
  day: string;
  meal: string;
  save: string;
  saving: string;
  remove: string;
  /** `{name}`, `{day}`, `{slot}`. */
  removeLabel: string;
  editLabel: string;
  added: string;
  pickDish: string;
  emptyTitle: string;
  emptyLede: string;
  adultsOnly: string;
  slotEmpty: string;
  /** `{slot}`. */
  addToSlot: string;
  /** Weekday names, Monday first. */
  dayNames: string[];
  slots: Record<MealSlot, string>;
};

const SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
const EVERYDAY: readonly MealSlot[] = ["breakfast", "lunch", "dinner"];
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

type Picker = { dishes: PickerDish[]; familyDiet: Diet | null; people: { name: string; diet: Diet }[]; pickerLabels: RecipePickerLabels };

export function WeekTemplateEditor({
  householdId,
  canEdit,
  options,
  picker,
  labels,
}: {
  householdId: string;
  canEdit: boolean;
  options: TemplateOption[];
  picker: Picker;
  labels: WeekTemplateLabels;
}) {
  const [sheet, setSheet] = useState<{ option?: TemplateOption; weekday?: Weekday; slot?: MealSlot } | null>(null);
  const days: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{labels.title}</h2>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.lede}</p>
        </div>
        {canEdit ? (
          <Pill type="button" tone="soft" className="gap-1.5" onClick={() => setSheet({})}>
            <Plus aria-hidden className="size-3.5" /> {labels.add}
          </Pill>
        ) : null}
      </div>
      {!canEdit ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.adultsOnly}</p> : null}

      {options.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          tone="meals"
          title={labels.emptyTitle}
          description={labels.emptyLede}
          action={
            canEdit ? (
              <Pill type="button" tone="primary" className="gap-1.5" onClick={() => setSheet({})}>
                <Plus aria-hidden className="size-3.5" /> {labels.add}
              </Pill>
            ) : undefined
          }
        />
      ) : (
        <Card className="p-2">
          <ul className="divide-y divide-[var(--wh-border)]">
            {days.map((weekday) => {
              const dayName = labels.dayNames[weekday - 1]!;
              const ofDay = options.filter((option) => option.weekday === weekday);
              const slots = SLOTS.filter((slot) => EVERYDAY.includes(slot) || ofDay.some((option) => option.slot === slot));
              const summary = slots
                .filter((slot) => ofDay.some((option) => option.slot === slot))
                .map((slot) => `${labels.slots[slot]} ${ofDay.filter((option) => option.slot === slot).length}`)
                .join(" · ");
              return (
                <ExpandableRow
                  key={weekday}
                  summary={
                    <>
                      <IconTile icon={CalendarDays} tone="meals" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{dayName}</span>
                        <span className="block text-xs text-[var(--wh-foreground-muted)]">{summary || labels.slotEmpty}</span>
                      </span>
                    </>
                  }
                >
                  <div className="space-y-3">
                    {slots.map((slot) => {
                      const listed = ofDay.filter((option) => option.slot === slot).sort((a, b) => a.position - b.position);
                      return (
                        <div key={slot}>
                          <p className="text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{labels.slots[slot]}</p>
                          {listed.length === 0 ? <p className="mt-1 text-xs text-[var(--wh-foreground-muted)]">{labels.slotEmpty}</p> : null}
                          <ul className="mt-1 space-y-1">
                            {listed.map((option) => (
                              <li key={option.id} className="flex items-center gap-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-2.5 py-1.5">
                                <span className="min-w-0 flex-1 text-sm break-words">{option.name}</span>
                                {canEdit ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setSheet({ option })}
                                      aria-label={fill(labels.editLabel, { name: option.name, day: dayName, slot: labels.slots[slot] })}
                                      className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
                                    >
                                      <Pencil aria-hidden className="size-4" />
                                    </button>
                                    <RemoveOption householdId={householdId} option={option} label={fill(labels.removeLabel, { name: option.name, day: dayName, slot: labels.slots[slot] })} />
                                  </>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => setSheet({ weekday, slot })}
                              className="mt-1.5 flex min-h-10 w-full items-center gap-2 rounded-[var(--wh-radius-sm)] border border-dashed border-[var(--wh-border)] px-3 text-left text-sm text-[var(--wh-foreground-muted)] hover:border-[var(--wh-primary)] hover:text-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
                            >
                              <Plus aria-hidden className="size-4 shrink-0" />
                              <span className="min-w-0 flex-1 break-words">{fill(labels.addToSlot, { slot: labels.slots[slot] })}</span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </ExpandableRow>
              );
            })}
          </ul>
        </Card>
      )}

      {sheet ? (
        <OptionSheet
          key={sheet.option?.id ?? `${sheet.weekday ?? "any"}-${sheet.slot ?? "any"}`}
          householdId={householdId}
          option={sheet.option}
          weekday={sheet.weekday}
          slot={sheet.slot}
          picker={picker}
          labels={labels}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </section>
  );
}

function RemoveOption({ householdId, option, label }: { householdId: string; option: TemplateOption; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={label}
      onClick={() =>
        startTransition(async () => {
          const result = await removeTemplateOptionAction({ householdId, optionId: option.id });
          if (result.ok) router.refresh();
        })
      }
      className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50"
    >
      <X aria-hidden className="size-4" />
    </button>
  );
}

function OptionSheet({
  householdId,
  option,
  weekday,
  slot,
  picker,
  labels,
  onClose,
}: {
  householdId: string;
  option?: TemplateOption;
  weekday?: Weekday;
  slot?: MealSlot;
  picker: Picker;
  labels: WeekTemplateLabels;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dish, setDish] = useState(option ? `recipe:${option.recipeId}` : "");
  const [days, setDays] = useState<string>(option ? String(option.weekday) : weekday ? String(weekday) : "every");
  const [mealSlot, setMealSlot] = useState<MealSlot>(option?.slot ?? slot ?? "dinner");
  const [said, setSaid] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const select = "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";

  const save = () => {
    if (!dish) return setSaid({ tone: "error", text: labels.pickDish });
    startTransition(async () => {
      const result = option
        ? await updateTemplateOptionAction({ householdId, optionId: option.id, weekday: Number(days), slot: mealSlot, dish })
        : await addTemplateOptionAction({ householdId, days, slot: mealSlot, dish });
      if (!result.ok) return setSaid({ tone: "error", text: result.error });
      router.refresh();
      if (option) return onClose();
      // Adding keeps the sheet open for the next dish: several options per meal is the point.
      setSaid({ tone: "info", text: labels.added });
      setDish("");
    });
  };

  return (
    <Sheet open onOpenChange={(open) => (open ? null : onClose())} title={option ? labels.editTitle : labels.addTitle} description={labels.addLede}>
      <div className="space-y-3">
        {said ? <Alert tone={said.tone === "info" ? "info" : undefined}>{said.text}</Alert> : null}
        <RecipePicker dishes={picker.dishes} value={dish} onChange={setDish} familyDiet={picker.familyDiet} people={picker.people} labels={picker.pickerLabels} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="template-days" className="block text-sm font-medium">
              {option ? labels.day : labels.days}
            </label>
            <select id="template-days" value={days} onChange={(event) => setDays(event.target.value)} className={select}>
              {option ? null : (
                <>
                  <option value="every">{labels.every}</option>
                  <option value="weekdays">{labels.weekdays}</option>
                  <option value="weekend">{labels.weekend}</option>
                </>
              )}
              {labels.dayNames.map((name, index) => (
                <option key={name} value={String(index + 1)}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="template-slot" className="block text-sm font-medium">
              {labels.meal}
            </label>
            <select id="template-slot" value={mealSlot} onChange={(event) => setMealSlot(event.target.value as MealSlot)} className={select}>
              {SLOTS.map((key) => (
                <option key={key} value={key}>
                  {labels.slots[key]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button type="button" className="w-full" disabled={pending} onClick={save}>
          {pending ? labels.saving : labels.save}
        </Button>
        {option ? (
          <Button
            type="button"
            variant="quiet"
            className="w-full"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await removeTemplateOptionAction({ householdId, optionId: option.id });
                if (!result.ok) return setSaid({ tone: "error", text: result.error });
                router.refresh();
                onClose();
              })
            }
          >
            {labels.remove}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

export type WeekPlanLabels = {
  title: string;
  /** `{count}`. */
  planned: string;
  plannedOne: string;
  plannedNone: string;
  fill: string;
  filling: string;
  filled: string;
  filledOne: string;
  filledNone: string;
  setUp: string;
  setUpLede: string;
};

/**
 * "WonderHome's plan for this week" above the week: what it planned from the
 * template (already on the plan — accepted unless someone changes it), and
 * "Plan this week from the template" to fill what is still empty.
 */
export function WeekPlanCard({
  householdId,
  week,
  hasTemplate,
  canEdit,
  planned,
  labels,
}: {
  householdId: string;
  week: string;
  hasTemplate: boolean;
  canEdit: boolean;
  /** How many WonderHome picked for this week; null when it has not planned it. */
  planned: number | null;
  labels: WeekPlanLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState<string | null>(null);

  if (!hasTemplate) {
    if (!canEdit) return null;
    return (
      <Card className="flex items-start gap-3 p-3.5">
        <IconTile icon={Sparkles} tone="meals" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.setUp}</p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.setUpLede}</p>
          <PillLink href="/meals?tab=template" tone="quiet" className="mt-2">
            {labels.setUp}
          </PillLink>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex items-start gap-3 p-3.5">
      <IconTile icon={Sparkles} tone="meals" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{labels.title}</p>
        <p className="text-xs text-[var(--wh-foreground-muted)]">
          {planned === null ? labels.setUpLede : planned === 0 ? labels.plannedNone : planned === 1 ? labels.plannedOne : fill(labels.planned, { count: planned })}
        </p>
        {canEdit ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill
              type="button"
              tone="quiet"
              disabled={pending}
              className="gap-1.5"
              onClick={() =>
                startTransition(async () => {
                  const result = await planWeekFromTemplateAction({ householdId, week });
                  if (!result.ok) return setSaid(result.error);
                  const count = result.count ?? 0;
                  setSaid(count === 0 ? labels.filledNone : count === 1 ? labels.filledOne : fill(labels.filled, { count }));
                  router.refresh();
                })
              }
            >
              <Sparkles aria-hidden className="size-3.5" /> {pending ? labels.filling : labels.fill}
            </Pill>
            {said ? (
              <p role="status" className="text-xs text-[var(--wh-foreground-muted)]">
                {said}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** "Choose again" on a meal WonderHome picked: the next dish the template lists for that meal. */
export function ChooseAgainButton({ householdId, mealId, onDate, labels }: { householdId: string; mealId: string; onDate: string; labels: { action: string; working: string; label: string } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Pill
        type="button"
        tone="quiet"
        disabled={pending}
        aria-label={labels.label}
        className="gap-1.5"
        onClick={() =>
          startTransition(async () => {
            const result = await chooseAgainAction({ householdId, mealId, onDate });
            if (!result.ok) return setError(result.error);
            setError(null);
            router.refresh();
          })
        }
      >
        <Shuffle aria-hidden className="size-3.5" /> {pending ? labels.working : labels.action}
      </Pill>
      {error ? (
        <p role="status" className="w-full text-xs text-[var(--wh-foreground-muted)]">
          {error}
        </p>
      ) : null}
    </>
  );
}
