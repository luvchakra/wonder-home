"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";
import { Field } from "@wonderhome/core/ui/field";

import type { ReplyState } from "../(auth)/event-actions";

export type EventReplyLabels = {
  name: string;
  question: string;
  yes: string;
  maybe: string;
  no: string;
  partySize: string;
  note: string;
  send: string;
  sending: string;
  /** `{name}` is filled with the name they gave. */
  sent: Record<"yes" | "no" | "maybe", string>;
  change: string;
  privacy: string;
};

/**
 * A guest's reply through an event's invite link: their name, yes / maybe / no, how many, and a note.
 * `guestName` is the name the household picked when it sent this link (`?to=`), filled in for them to keep or change.
 */
export function EventReplyForm({
  token,
  action,
  labels,
  guestName,
}: {
  token: string;
  action: (state: ReplyState, formData: FormData) => Promise<ReplyState>;
  labels: EventReplyLabels;
  guestName?: string | null;
}) {
  const [state, formAction, pending] = useActionState<ReplyState, FormData>(action, {});
  return (
    <div className="space-y-4">
      {state.replied ? (
        <Alert tone="info">
          {labels.sent[state.replied].replace("{name}", state.name ?? "")} {labels.change}
        </Alert>
      ) : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label={labels.name} name="name" required maxLength={80} autoComplete="name" defaultValue={state.name ?? guestName ?? ""} />
        <ChoiceChips
          legend={labels.question}
          name="response"
          options={[
            { value: "yes", label: labels.yes },
            { value: "maybe", label: labels.maybe },
            { value: "no", label: labels.no },
          ]}
          defaultValue={state.replied ?? "yes"}
        />
        <Field label={labels.partySize} name="partySize" type="number" min={1} max={20} defaultValue="1" inputMode="numeric" />
        <Field label={labels.note} name="note" maxLength={300} autoComplete="off" />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? labels.sending : labels.send}
        </Button>
        <p className="text-center text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{labels.privacy}</p>
      </form>
    </div>
  );
}
