"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Select } from "@wonderhome/core/ui/select";

import type { ActionState } from "../(auth)/actions";
import { saveChildQuietHoursAction } from "../(auth)/child-quiet-actions";

export type ChildQuietLabels = {
  title: string;
  /** "Right now: 8:30 PM to 7:00 AM, for their age" or "…, set by a guardian". */
  current: string;
  from: string;
  until: string;
  save: string;
  saving: string;
  useDefault: string;
  saved: string;
  restored: string;
};

function Save({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * A child's quiet hours (story 27-015), for an Admin or their guardian: the window
 * their reminders stay quiet in, with their age's default until one is set.
 */
export function ChildQuietControl({
  householdId,
  childId,
  from,
  until,
  times,
  labels,
}: {
  householdId: string;
  childId: string;
  from: string;
  until: string;
  times: { value: string; label: string }[];
  labels: ChildQuietLabels;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveChildQuietHoursAction, {});
  return (
    <form action={action} className="space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="childId" value={childId} />
      <div>
        <p className="text-sm font-medium">{labels.title}</p>
        <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.current}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select label={labels.from} name="quietFrom" defaultValue={from}>
          {times.map((time) => (
            <option key={time.value} value={time.value}>
              {time.label}
            </option>
          ))}
        </Select>
        <Select label={labels.until} name="quietUntil" defaultValue={until}>
          {times.map((time) => (
            <option key={time.value} value={time.value}>
              {time.label}
            </option>
          ))}
        </Select>
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice === "saved" ? <Alert tone="info">{labels.saved}</Alert> : null}
      {state.notice === "default" ? <Alert tone="info">{labels.restored}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Save label={labels.save} pendingLabel={labels.saving} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="useDefault" className="size-5 rounded border-[var(--wh-border-strong)] accent-[var(--wh-primary)]" />
          <span>{labels.useDefault}</span>
        </label>
      </div>
    </form>
  );
}
