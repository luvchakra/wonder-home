"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";

import type { ActionState } from "../(auth)/actions";
import type { TeachState } from "../(auth)/configuration-actions";

/**
 * The wizard's forms.
 *
 * Each one saves on its own and reports what the change will do — the
 * downstream sentences come back from the server with the saved result, so
 * a household is told what they have just agreed to in the same breath as
 * being told it worked.
 */

/**
 * The forms' words in the viewer's language, built on the server by
 * `configFormLabels` (story 22-004). What the household types — outcome
 * names, member names — is never translated; the stored values behind a
 * choice (an autonomy mode, a category) never change.
 */
export type ConfigFormLabels = {
  saving: string;
  nobodyYet: string;
  outcome: string;
  owner: string;
  backup: string;
  backupHint: string;
  aiMode: string;
  aiModes: Record<ResponsibilityInitial["aiMode"], string>;
  aiModeHint: string;
  priority: string;
  priority1: string;
  priority3: string;
  priority5: string;
  priorityHint: string;
  saveChanges: string;
  saveResponsibility: string;
  name: string;
  playbookNamePlaceholder: string;
  playbookNameHint: string;
  definition: string;
  definitionPlaceholder: string;
  definitionHint: string;
  moreDetail: string;
  fromHour: string;
  toHour: string;
  escalate: string;
  escalateHint: string;
  dependsOn: string;
  dependsOnNothing: string;
  dependsOnHint: string;
  savePlaybook: string;
  nextVersion: string;
  governs: string;
  /** Policy categories by their stored value. */
  categories: Record<string, string>;
  policyNamePlaceholder: string;
  limit: string;
  limitHint: string;
  note: string;
  notePlaceholder: string;
  narrow: string;
  appliesTo: string;
  everyone: string;
  adults: string;
  children: string;
  helpers: string;
  appliesToHint: string;
  saveNewVersion: string;
  savePolicy: string;
  teach: string;
  teachPlaceholder: string;
  teachHint: string;
  teachSee: string;
  whatYouCanSay: string;
  saved: string;
  yesDoThat: string;
};

/** The policy categories the form offers, in order, by their stored value. */
const POLICY_CATEGORIES = ["spending", "privacy", "family_time", "notifications", "ai_autonomy", "safety"] as const;

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Select({
  label,
  name,
  options,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {hint ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{hint}</p> : null}
    </div>
  );
}

function Outcome({ state }: { state: ActionState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.notice) return <Alert tone="info">{state.notice}</Alert>;
  return null;
}

export type MemberOption = { id: string; displayName: string };

export type ResponsibilityInitial = {
  outcomeKey: string;
  outcomeLabel: string;
  primaryMemberId: string | null;
  backupMemberId: string | null;
  aiMode: "observe" | "prepare" | "approve" | "execute";
  priority: number;
};

export function ResponsibilityForm({
  action,
  householdId,
  members,
  outcomes = [],
  initial,
  labels,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  members: MemberOption[];
  labels: ConfigFormLabels;
  /** Outcomes offered when creating a new responsibility. Unused once `initial` is set. */
  outcomes?: { key: string; label: string }[];
  /** Editing an existing responsibility rather than creating one — the outcome is fixed. */
  initial?: ResponsibilityInitial;
}) {
  const [state, formAction] = useActionState(action, {});
  const people = [{ value: "", label: labels.nobodyYet }, ...members.map((m) => ({ value: m.id, label: m.displayName }))];

  return (
    <form action={formAction} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="householdId" value={householdId} />
      {initial ? (
        <>
          <input type="hidden" name="outcomeKey" value={initial.outcomeKey} />
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{labels.outcome}</p>
            <p className="text-sm font-medium">{initial.outcomeLabel}</p>
          </div>
        </>
      ) : (
        <Select label={labels.outcome} name="outcomeKey" options={outcomes.map((o) => ({ value: o.key, label: o.label }))} />
      )}
      <Select label={labels.owner} name="primaryMemberId" options={people} defaultValue={initial?.primaryMemberId ?? undefined} />
      <Select
        label={labels.backup}
        name="backupMemberId"
        options={people}
        defaultValue={initial?.backupMemberId ?? undefined}
        hint={labels.backupHint}
      />
      <Select
        label={labels.aiMode}
        name="aiMode"
        defaultValue={initial?.aiMode ?? "prepare"}
        options={(["observe", "prepare", "approve", "execute"] as const).map((mode) => ({ value: mode, label: labels.aiModes[mode] }))}
        hint={labels.aiModeHint}
      />
      <Select
        label={labels.priority}
        name="priority"
        defaultValue={String(initial?.priority ?? 3)}
        options={[
          { value: "1", label: labels.priority1 },
          { value: "2", label: "2" },
          { value: "3", label: labels.priority3 },
          { value: "4", label: "4" },
          { value: "5", label: labels.priority5 },
        ]}
        hint={labels.priorityHint}
      />
      <Submit label={initial ? labels.saveChanges : labels.saveResponsibility} pendingLabel={labels.saving} />
    </form>
  );
}

export type PlaybookInitial = {
  outcomeKey: string;
  name: string;
  outcomeDefinition: string;
  startHour: number | null;
  endHour: number | null;
  escalateAfterHours: number | null;
};

export function PlaybookForm({
  action,
  householdId,
  existing,
  initial,
  labels,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  labels: ConfigFormLabels;
  /** Outcomes already in this household's playbook, offered as dependencies. */
  existing: { key: string; label: string }[];
  /** Editing an existing entry: its key stays put even if the name is reworded. */
  initial?: PlaybookInitial;
}) {
  const [state, formAction] = useActionState(action, {});
  const dependencies = existing.filter((outcome) => outcome.key !== initial?.outcomeKey);

  return (
    <form action={formAction} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="householdId" value={householdId} />
      {initial ? <input type="hidden" name="outcomeKey" value={initial.outcomeKey} /> : null}
      <Field label={labels.name} name="name" required maxLength={120} placeholder={labels.playbookNamePlaceholder} hint={labels.playbookNameHint} defaultValue={initial?.name} />
      <Field
        label={labels.definition}
        name="outcomeDefinition"
        required
        maxLength={500}
        placeholder={labels.definitionPlaceholder}
        hint={labels.definitionHint}
        defaultValue={initial?.outcomeDefinition}
      />

      <details open={Boolean(initial && (initial.startHour !== null || initial.escalateAfterHours !== null))} className="space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {labels.moreDetail}
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.fromHour} name="startHour" type="number" min={0} max={23} placeholder="8" defaultValue={initial?.startHour ?? undefined} />
            <Field label={labels.toHour} name="endHour" type="number" min={0} max={23} placeholder="20" defaultValue={initial?.endHour ?? undefined} />
          </div>
          <Field
            label={labels.escalate}
            name="escalateAfterHours"
            type="number"
            min={1}
            placeholder="12"
            hint={labels.escalateHint}
            defaultValue={initial?.escalateAfterHours ?? undefined}
          />
          {dependencies.length > 0 ? (
            <Select
              label={labels.dependsOn}
              name="dependsOnKey"
              options={[
                { value: "", label: labels.dependsOnNothing },
                ...dependencies.map((outcome) => ({ value: outcome.key, label: outcome.label })),
              ]}
              hint={labels.dependsOnHint}
            />
          ) : null}
        </div>
      </details>

      <Submit label={initial ? labels.saveChanges : labels.savePlaybook} pendingLabel={labels.saving} />
    </form>
  );
}

export type PolicyInitial = {
  category: string;
  name: string;
  limitMinor: number | null;
  note: string | null;
  conditionMemberType: string | null;
  conditionStartHour: number | null;
  conditionEndHour: number | null;
};

export function PolicyForm({
  action,
  householdId,
  initial,
  labels,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  labels: ConfigFormLabels;
  /** Editing: a policy is never edited in place, so this saves the next version under the same name and category. */
  initial?: PolicyInitial;
}) {
  const [state, formAction] = useActionState(action, {});
  const hasCondition = Boolean(initial && (initial.conditionMemberType || initial.conditionStartHour !== null));

  return (
    <form action={formAction} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="householdId" value={householdId} />
      {initial ? (
        <>
          <input type="hidden" name="category" value={initial.category} />
          <input type="hidden" name="name" value={initial.name} />
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{labels.categories[initial.category] ?? initial.category.replace(/_/g, " ")}</p>
            <p className="text-sm font-medium">{initial.name}</p>
            <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.nextVersion}</p>
          </div>
        </>
      ) : (
        <>
          <Select
            label={labels.governs}
            name="category"
            defaultValue="spending"
            options={POLICY_CATEGORIES.map((category) => ({ value: category, label: labels.categories[category] ?? category }))}
          />
          <Field label={labels.name} name="name" required maxLength={120} placeholder={labels.policyNamePlaceholder} />
        </>
      )}
      <Field
        label={labels.limit}
        name="limitMinor"
        type="number"
        min={0}
        placeholder="200000"
        hint={labels.limitHint}
        defaultValue={initial?.limitMinor ?? undefined}
      />
      <Field label={labels.note} name="note" maxLength={300} placeholder={labels.notePlaceholder} defaultValue={initial?.note ?? undefined} />

      <details open={hasCondition} className="space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-4">
        <summary className="cursor-pointer text-sm font-medium">{labels.narrow}</summary>
        <div className="mt-3 space-y-3">
          <Select
            label={labels.appliesTo}
            name="conditionMemberType"
            defaultValue={initial?.conditionMemberType ?? ""}
            options={[
              { value: "", label: labels.everyone },
              { value: "adult", label: labels.adults },
              { value: "child", label: labels.children },
              { value: "helper", label: labels.helpers },
            ]}
            hint={labels.appliesToHint}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.fromHour} name="conditionStartHour" type="number" min={0} max={23} placeholder="21" defaultValue={initial?.conditionStartHour ?? undefined} />
            <Field label={labels.toHour} name="conditionEndHour" type="number" min={0} max={23} placeholder="7" defaultValue={initial?.conditionEndHour ?? undefined} />
          </div>
        </div>
      </details>

      <Submit label={initial ? labels.saveNewVersion : labels.savePolicy} pendingLabel={labels.saving} />
    </form>
  );
}

/**
 * Teaching the household in a sentence (story 02-006).
 *
 * The preview is the whole point. A sentence is read, what it would do is
 * spelled out in the household's own terms, and only then is there a button
 * that changes anything. The "Yes, do that" button carries the exact summary
 * the person is looking at, so the server can refuse to apply something that
 * has come to mean something else since.
 *
 * When the sentence is not understood the reply is a question with examples,
 * never a shrug — and the forms above can say anything this can, so nobody is
 * ever stuck with a sentence WonderHome will not take.
 */
export function TeachForm({
  preview,
  apply,
  householdId,
  shapes,
  labels,
}: {
  preview: (state: TeachState, formData: FormData) => Promise<TeachState>;
  apply: (state: TeachState, formData: FormData) => Promise<TeachState>;
  householdId: string;
  shapes: { example: string; does: string }[];
  labels: ConfigFormLabels;
}) {
  const [state, formAction] = useActionState(preview, {});

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice && !state.proposal ? <Alert tone="info">{state.notice}</Alert> : null}
        <input type="hidden" name="householdId" value={householdId} />
        <Field
          label={labels.teach}
          name="utterance"
          required
          maxLength={300}
          placeholder={labels.teachPlaceholder}
          hint={labels.teachHint}
        />
        <Submit label={labels.teachSee} pendingLabel={labels.saving} />
      </form>

      {state.question ? (
        <div className="space-y-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-4">
          <p className="text-sm font-medium">{state.question}</p>
          <ul className="space-y-1">
            {(state.examples ?? []).map((example) => (
              <li key={example} className="text-sm text-[var(--wh-foreground-muted)]">“{example}”</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.proposal ? (
        <ApplyPanel apply={apply} householdId={householdId} proposal={state.proposal} notice={state.notice} labels={labels} />
      ) : null}

      <details className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-4">
        <summary className="cursor-pointer text-sm font-medium">{labels.whatYouCanSay}</summary>
        <ul className="mt-2 space-y-2">
          {shapes.map((shape) => (
            <li key={shape.example} className="text-sm">
              <span className="block">“{shape.example}”</span>
              <span className="block text-xs text-[var(--wh-foreground-muted)]">{shape.does}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ApplyPanel({
  apply,
  householdId,
  proposal,
  notice,
  labels,
}: {
  apply: (state: TeachState, formData: FormData) => Promise<TeachState>;
  householdId: string;
  proposal: { utterance: string; summary: string; downstream: string[] };
  notice?: string;
  labels: ConfigFormLabels;
}) {
  const [state, formAction] = useActionState(apply, {});
  const shown = state.proposal ?? proposal;
  const applied = Boolean(state.notice && !state.proposal);

  return (
    <form action={formAction} className="space-y-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {notice && !state.notice ? <Alert tone="info">{notice}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

      <p className="text-sm font-semibold">{applied ? labels.saved : shown.summary}</p>
      <ul className="space-y-1.5">
        {(applied ? (state.downstream ?? []) : shown.downstream).map((line) => (
          <li key={line} className="text-sm text-[var(--wh-foreground-muted)]">{line}</li>
        ))}
      </ul>

      {applied ? null : (
        <>
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="utterance" value={shown.utterance} />
          <input type="hidden" name="agreedTo" value={shown.summary} />
          <Submit label={labels.yesDoThat} pendingLabel={labels.saving} />
        </>
      )}
    </form>
  );
}
