"use client";

import { CalendarClock, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";

import { addCalendarSubscriptionAction, removeCalendarSubscriptionAction, syncCalendarSubscriptionNowAction } from "../(auth)/calendar-subscription-actions";
import type { ActionState } from "../(auth)/actions";

export type SubscriptionView = {
  id: string;
  name: string;
  visibility: "household" | "private";
  status: "active" | "error" | "paused";
  synced: boolean;
};

export type CalSubLabels = {
  add: string;
  name: string;
  namePlaceholder: string;
  link: string;
  linkPlaceholder: string;
  linkHint: string;
  visibility: string;
  visHousehold: string;
  visPrivate: string;
  create: string;
  cancel: string;
  refresh: string;
  remove: string;
  removeConfirm: string;
  empty: string;
  readonly: string;
  synced: string;
  never: string;
  failed: string;
};

const EMPTY: ActionState = {};

function Notice({ state }: { state: ActionState }) {
  if (state.error) return <Alert tone="attention" className="mt-2">{state.error}</Alert>;
  if (state.notice) return <Alert tone="info" className="mt-2">{state.notice}</Alert>;
  return null;
}

/** One server-action form (refresh / remove) with its own pending state. */
function RowForm({ householdId, id, action, confirm, children }: { householdId: string; id: string; action: typeof removeCalendarSubscriptionAction; confirm?: string; children: React.ReactNode }) {
  const [state, run, pending] = useActionState(action, EMPTY);
  return (
    <form
      action={run}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="quiet" disabled={pending} className="gap-1.5 text-sm">{children}</Button>
      {state.error ? <Notice state={state} /> : null}
    </form>
  );
}

function AddForm({ householdId, labels, onDone }: { householdId: string; labels: CalSubLabels; onDone: () => void }) {
  const [state, run, pending] = useActionState(addCalendarSubscriptionAction, EMPTY);
  return (
    <Card className="p-4">
      <form action={run} className="space-y-3">
        <input type="hidden" name="householdId" value={householdId} />
        <Field label={labels.name} name="name" placeholder={labels.namePlaceholder} required maxLength={80} />
        <Field label={labels.link} name="url" type="url" inputMode="url" placeholder={labels.linkPlaceholder} hint={labels.linkHint} required />
        <Select label={labels.visibility} name="visibility" defaultValue="household">
          <option value="household">{labels.visHousehold}</option>
          <option value="private">{labels.visPrivate}</option>
        </Select>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" variant="primary" disabled={pending} className="gap-2">
            <Plus aria-hidden className="size-4" /> {labels.create}
          </Button>
          <Button type="button" variant="quiet" onClick={onDone}>{labels.cancel}</Button>
        </div>
        <Notice state={state} />
      </form>
    </Card>
  );
}

export function CalendarSubscriptionsManager({ householdId, subscriptions, labels }: { householdId: string; subscriptions: SubscriptionView[]; labels: CalSubLabels }) {
  const [adding, setAdding] = useState(false);
  const statusWord = (sub: SubscriptionView) => (sub.status === "error" ? labels.failed : sub.synced ? labels.synced : labels.never);

  return (
    <div className="space-y-3">
      {subscriptions.length === 0 ? (
        <Card className="p-4 text-sm text-[var(--wh-foreground-muted)]">{labels.empty}</Card>
      ) : (
        <Card className="divide-y divide-[var(--wh-border)] p-0">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="flex items-center gap-3 p-3">
              <IconTile icon={CalendarClock} tone="people" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{sub.name}</p>
                <p className="truncate text-xs text-[var(--wh-foreground-muted)]">
                  {sub.visibility === "private" ? labels.visPrivate : labels.visHousehold} · {statusWord(sub)}
                </p>
              </div>
              <RowForm householdId={householdId} id={sub.id} action={syncCalendarSubscriptionNowAction}>
                <RefreshCw aria-hidden className="size-4" /> {labels.refresh}
              </RowForm>
              <RowForm householdId={householdId} id={sub.id} action={removeCalendarSubscriptionAction} confirm={labels.removeConfirm}>
                <Trash2 aria-hidden className="size-4" /> {labels.remove}
              </RowForm>
            </div>
          ))}
        </Card>
      )}

      <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.readonly}</p>

      {adding ? (
        <AddForm householdId={householdId} labels={labels} onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" variant="secondary" onClick={() => setAdding(true)} className="gap-2">
          <Plus aria-hidden className="size-4" /> {labels.add}
        </Button>
      )}
    </div>
  );
}
