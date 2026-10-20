"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

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
};

const ICON_BUTTON =
  "grid size-9 place-items-center rounded-full text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50";
const named = (template: string, name: string) => template.replaceAll("{name}", name);

/** Set a goal with a child, or change one (story 08-017). */
export function GoalSheet({ householdId, child, goal, emojis, words }: { householdId: string; child: { id: string; name: string }; goal?: GoalValue; emojis: readonly string[]; words: GoalWords }) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<GoalValue["period"]>(goal?.period ?? "day");
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
          <Field label={words.title} name="title" required defaultValue={goal?.title ?? ""} placeholder={words.titlePlaceholder} autoComplete="off" maxLength={120} />
          <ComboboxField
            label={words.kind}
            name="kind"
            required
            options={Object.keys(words.kinds)}
            optionLabels={words.kinds}
            defaultValue={goal?.kind ?? "reading"}
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
                  <input type="radio" name="emoji" value={emoji} defaultChecked={goal ? goal.emoji === emoji : index === 0} className="sr-only" />
                  <span aria-hidden>{emoji}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Select label={words.period} name="period" value={period} onChange={(event) => setPeriod(event.target.value as GoalValue["period"])}>
            <option value="day">{words.periods.day}</option>
            <option value="week">{words.periods.week}</option>
            <option value="once">{words.periods.once}</option>
          </Select>
          {period === "week" ? (
            <Select label={words.target} name="target" defaultValue={String(goal?.period === "week" ? goal.target : 3)}>
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
          <Field label={words.endsOn} name="endsOn" type="date" defaultValue={goal?.endsOn ?? ""} />
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
