"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import type { GoalStart } from "@wonderhome/core/school/goals";
import { Alert } from "@wonderhome/core/ui/alert";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { retireGoalAction, saveGoalAction } from "../(auth)/goal-actions";
import { SubmitButton } from "../_components/submit-pill";

/** Every word the goal editor needs, in the reader's language (built on the server). */
export type GoalWords = {
  add: string;
  edit: string;
  retire: string;
  sheetAdd: string;
  sheetEdit: string;
  sheetLede: string;
  title: string;
  titlePlaceholder: string;
  kind: string;
  kinds: Record<string, string>;
  emoji: string;
  period: string;
  periods: { day: string; week: string; once: string };
  target: string;
  stars: string;
  reward: string;
  rewardPlaceholder: string;
  endsOn: string;
  save: string;
  saving: string;
  addNew: string;
  chooseExisting: string;
  startFrom: string;
  ownGoal: string;
  fromClasses: string;
  fromWork: string;
  /** `{name}`: a goal from a class that meets once a week. */
  titleClassOnce: string;
  /** `{name}`, `{count}`: a goal from a class that meets more often. */
  titleClass: string;
  /** `{name}`. */
  titleWork: string;
  /** `{name}`. */
  metByWork: string;
};

export type GoalValue = {
  id: string;
  title: string;
  kind: string;
  emoji: string;
  period: "day" | "week" | "once";
  target: number;
  stars: number;
  reward: string | null;
  endsOn: string | null;
  source?: GoalStart["source"] | null;
};

const ICON_BUTTON =
  "grid size-9 place-items-center rounded-full text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50";
const named = (template: string, name: string) => template.replaceAll("{name}", name);

const keyOf = (source: GoalStart["source"] | null | undefined) => (source ? `${source.kind}:${source.id}` : "");

/**
 * Set a goal with a child, or change one (story 08-017). "Start from" offers
 * the child's own classes and open school work (the owner, 2026-10-20):
 * picking one fills the goal in — its name, kind, picture, how often and by
 * when — and every field stays editable. A goal from school work is met the
 * day that work is marked done, so it has no "how often" of its own.
 */
export function GoalSheet({
  householdId,
  child,
  goal,
  starts = [],
  emojis,
  words,
}: {
  householdId: string;
  child: { id: string; name: string };
  goal?: GoalValue;
  /** What this child's goal can start from. */
  starts?: GoalStart[];
  emojis: readonly string[];
  words: GoalWords;
}) {
  const [open, setOpen] = useState(false);
  const [startKey, setStartKey] = useState(keyOf(goal?.source));
  const start = starts.find((entry) => keyOf(entry.source) === startKey) ?? null;
  // A source no longer listed (the work is done, the class gone) is kept as it was.
  const source = start?.source ?? (startKey && goal?.source && keyOf(goal.source) === startKey ? goal.source : null);
  const fromWork = source?.kind === "school_item";
  const fresh = start && keyOf(goal?.source) !== startKey;
  const prefill = fresh
    ? {
        title:
          start.source.kind === "school_item"
            ? named(words.titleWork, start.name)
            : start.target > 1
              ? named(words.titleClass, start.name).replace("{count}", String(start.target))
              : named(words.titleClassOnce, start.name),
        kind: start.goalKind,
        emoji: start.emoji,
        period: start.period,
        target: start.target,
        endsOn: start.endsOn,
      }
    : null;
  const [period, setPeriod] = useState<GoalValue["period"]>(goal?.period ?? "day");
  const shownPeriod = fromWork ? "once" : period;
  const classes = starts.filter((entry) => entry.source.kind === "activity");
  const work = starts.filter((entry) => entry.source.kind === "school_item");
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, data) => {
    const result = await saveGoalAction(previous, data);
    if (!result.error) setOpen(false);
    return result;
  }, {});
  return (
    <>
      {goal ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={named(words.edit, goal.title)} title={named(words.edit, goal.title)} className={ICON_BUTTON}>
          <Pencil aria-hidden className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--wh-radius-pill)] px-2 text-sm font-semibold text-[var(--wh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
        >
          <Plus aria-hidden className="size-4" /> {words.add}
        </button>
      )}
      <Sheet open={open} onOpenChange={setOpen} title={goal ? named(words.sheetEdit, goal.title) : named(words.sheetAdd, child.name)} description={named(words.sheetLede, child.name)}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="childMemberId" value={child.id} />
          <input type="hidden" name="id" value={goal?.id ?? ""} />
          <input type="hidden" name="sourceKind" value={source?.kind ?? ""} />
          <input type="hidden" name="sourceId" value={source?.id ?? ""} />
          {starts.length > 0 || goal?.source ? (
            <Select
              label={words.startFrom}
              name="startFrom"
              value={startKey}
              onChange={(event) => {
                const next = event.target.value;
                setStartKey(next);
                const picked = starts.find((entry) => keyOf(entry.source) === next);
                if (picked) setPeriod(picked.period);
              }}
            >
              <option value="">{words.ownGoal}</option>
              {classes.length > 0 ? (
                <optgroup label={words.fromClasses}>
                  {classes.map((entry) => (
                    <option key={entry.source.id} value={keyOf(entry.source)}>
                      {entry.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {work.length > 0 ? (
                <optgroup label={words.fromWork}>
                  {work.map((entry) => (
                    <option key={entry.source.id} value={keyOf(entry.source)}>
                      {entry.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {goal?.source && !starts.some((entry) => keyOf(entry.source) === keyOf(goal.source)) ? <option value={keyOf(goal.source)}>{goal.title}</option> : null}
            </Select>
          ) : null}
          <div key={fresh ? startKey : "kept"} className="space-y-3">
          <Field label={words.title} name="title" required defaultValue={prefill?.title ?? goal?.title ?? ""} placeholder={words.titlePlaceholder} autoComplete="off" maxLength={120} />
          <ComboboxField
            label={words.kind}
            name="kind"
            required
            options={Object.keys(words.kinds)}
            optionLabels={words.kinds}
            defaultValue={prefill?.kind ?? goal?.kind ?? "reading"}
            addNewLabel={words.addNew}
            chooseExistingLabel={words.chooseExisting}
          />
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium">{words.emoji}</legend>
            <div className="flex flex-wrap gap-2">
              {emojis.map((emoji, index) => (
                <label
                  key={emoji}
                  className="grid size-11 cursor-pointer place-items-center rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] text-xl has-[:checked]:border-[var(--wh-primary)] has-[:checked]:bg-[var(--wh-primary-soft)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--wh-primary)]"
                >
                  <input type="radio" name="emoji" value={emoji} defaultChecked={prefill ? prefill.emoji === emoji : goal ? goal.emoji === emoji : index === 0} className="sr-only" />
                  <span aria-hidden>{emoji}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {fromWork ? (
            <>
              <input type="hidden" name="period" value="once" />
              <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm">{named(words.metByWork, start?.name ?? goal?.title ?? "")}</p>
            </>
          ) : (
            <Select label={words.period} name="period" value={shownPeriod} onChange={(event) => setPeriod(event.target.value as GoalValue["period"])}>
              <option value="day">{words.periods.day}</option>
              <option value="week">{words.periods.week}</option>
              <option value="once">{words.periods.once}</option>
            </Select>
          )}
          {shownPeriod === "week" ? (
            <Select label={words.target} name="target" defaultValue={String(prefill?.period === "week" ? prefill.target : goal?.period === "week" ? goal.target : 3)}>
              {[1, 2, 3, 4, 5, 6, 7].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </Select>
          ) : null}
          <Select label={words.stars} name="stars" defaultValue={String(goal?.stars ?? 1)}>
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {"⭐".repeat(count)} {count}
              </option>
            ))}
          </Select>
          <Field label={words.reward} name="reward" defaultValue={goal?.reward ?? ""} placeholder={words.rewardPlaceholder} autoComplete="off" maxLength={120} />
          <Field label={words.endsOn} name="endsOn" type="date" defaultValue={prefill ? (prefill.endsOn ?? "") : (goal?.endsOn ?? "")} />
          </div>
          <SubmitButton className="w-full" pendingLabel={words.saving}>
            {words.save}
          </SubmitButton>
        </form>
      </Sheet>
    </>
  );
}

/** A goal the child is done with: retired, the stars it earned kept. */
export function RetireGoalButton({ householdId, id, label }: { householdId: string; id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={label}
        title={error ?? label}
        className={ICON_BUTTON}
        onClick={() =>
          startTransition(async () => {
            const result = await retireGoalAction({ householdId, id });
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {error ? (
        <span role="alert" className="sr-only">
          {error}
        </span>
      ) : null}
    </>
  );
}
