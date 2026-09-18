"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";

import type { ActionState } from "../(auth)/actions";

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
        label="Key"
        name="outcomeKey"
        required
        placeholder="laundry.ready"
        hint="Lowercase, with dots — how the planner refers to it."
      />
      <Field
        label="What good looks like"
        name="outcomeDefinition"
        required
        maxLength={500}
        placeholder="Clean uniforms ready by Sunday evening."
        hint="The state you want, in your own words — not the steps."
      />
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
