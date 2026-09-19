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

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : label}
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

export function ResponsibilityForm({
  action,
  householdId,
  members,
  outcomes,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  members: MemberOption[];
  outcomes: { key: string; label: string }[];
}) {
  const [state, formAction] = useActionState(action, {});
  const people = [{ value: "", label: "Nobody yet" }, ...members.map((m) => ({ value: m.id, label: m.displayName }))];

  return (
    <form action={formAction} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="householdId" value={householdId} />
      <Select label="Outcome" name="outcomeKey" options={outcomes.map((o) => ({ value: o.key, label: o.label }))} />
      <Select label="Who owns it" name="primaryMemberId" options={people} />
      <Select
        label="Who covers for them"
        name="backupMemberId"
        options={people}
        hint="Somebody other than the owner, or nobody."
      />
      <Select
        label="How far WonderHome may go"
        name="aiMode"
        defaultValue="prepare"
        options={[
          { value: "observe", label: "Watch only" },
          { value: "prepare", label: "Prepare, and leave it to me" },
          { value: "approve", label: "Ask me before acting" },
          { value: "execute", label: "Act, and tell me afterwards" },
        ]}
        hint="Autonomy never overrides a policy, whichever level you choose."
      />
      <Select
        label="Priority"
        name="priority"
        defaultValue="3"
        options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}` }))}
      />
      <Submit label="Save responsibility" />
    </form>
  );
}

export function PlaybookForm({
  action,
  householdId,
  existing,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  /** Outcomes already in this household's playbook, offered as dependencies. */
  existing: { key: string; label: string }[];
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="householdId" value={householdId} />
      <Field label="Name" name="name" required maxLength={120} placeholder="Laundry ready" hint="What your family would call it." />
      <Field
        label="What good looks like"
        name="outcomeDefinition"
        required
        maxLength={500}
        placeholder="Clean uniforms ready by Sunday evening."
        hint="The state you want, in your own words — not the steps."
      />

      <details className="space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-4">
        <summary className="cursor-pointer text-sm font-medium">
          More detail, if it matters here (optional)
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From (hour)" name="startHour" type="number" min={0} max={23} placeholder="8" />
            <Field label="To (hour)" name="endHour" type="number" min={0} max={23} placeholder="20" />
          </div>
          <Field
            label="Escalate after (hours)"
            name="escalateAfterHours"
            type="number"
            min={1}
            placeholder="12"
            hint="How long it may be at risk before somebody is told. Leave empty for never."
          />
          {existing.length > 0 ? (
            <Select
              label="What has to happen first"
              name="dependsOnKey"
              options={[
                { value: "", label: "Nothing — it stands alone" },
                ...existing.map((outcome) => ({ value: outcome.key, label: outcome.label })),
              ]}
              hint="Planning waits for this one. A loop between two outcomes is refused."
            />
          ) : null}
        </div>
      </details>

      <Submit label="Save playbook entry" />
    </form>
  );
}

export function PolicyForm({
  action,
  householdId,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="householdId" value={householdId} />
      <Select
        label="What it governs"
        name="category"
        defaultValue="spending"
        options={[
          { value: "spending", label: "Spending" },
          { value: "privacy", label: "Privacy" },
          { value: "family_time", label: "Family time" },
          { value: "notifications", label: "Notifications" },
          { value: "ai_autonomy", label: "AI autonomy" },
          { value: "safety", label: "Safety" },
        ]}
      />
      <Field label="Name" name="name" required maxLength={120} placeholder="Everyday spending" />
      <Field
        label="Limit (in paise, optional)"
        name="limitMinor"
        type="number"
        min={0}
        placeholder="200000"
        hint="₹2,000 is 200000. Above this, WonderHome asks."
      />
      <Field label="Note" name="note" maxLength={300} placeholder="Why this rule exists." />
      <Submit label="Save policy" />
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
}: {
  preview: (state: TeachState, formData: FormData) => Promise<TeachState>;
  apply: (state: TeachState, formData: FormData) => Promise<TeachState>;
  householdId: string;
  shapes: { example: string; does: string }[];
}) {
  const [state, formAction] = useActionState(preview, {});

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice && !state.proposal ? <Alert tone="info">{state.notice}</Alert> : null}
        <input type="hidden" name="householdId" value={householdId} />
        <Field
          label="Tell WonderHome how the home runs"
          name="utterance"
          required
          maxLength={300}
          placeholder="Priya handles the school run from now on."
          hint="Nothing changes until you have seen what it would do."
        />
        <Submit label="See what that would do" />
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
        <ApplyPanel apply={apply} householdId={householdId} proposal={state.proposal} notice={state.notice} />
      ) : null}

      <details className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-4">
        <summary className="cursor-pointer text-sm font-medium">What you can say</summary>
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
}: {
  apply: (state: TeachState, formData: FormData) => Promise<TeachState>;
  householdId: string;
  proposal: { utterance: string; summary: string; downstream: string[] };
  notice?: string;
}) {
  const [state, formAction] = useActionState(apply, {});
  const shown = state.proposal ?? proposal;
  const applied = Boolean(state.notice && !state.proposal);

  return (
    <form action={formAction} className="space-y-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {notice && !state.notice ? <Alert tone="info">{notice}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

      <p className="text-sm font-semibold">{applied ? "Saved." : shown.summary}</p>
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
          <Submit label="Yes, do that" />
        </>
      )}
    </form>
  );
}
