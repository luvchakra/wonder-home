"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import type { ActionState } from "../(auth)/actions";

/** The button's words in the reader's language (story 22-004). */
export type AcceptInvitationLabels = { accept: string; pending: string };

export type AcceptInvitationFormProps = {
  token: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  labels?: AcceptInvitationLabels;
};

export function AcceptInvitationForm({ token, action, labels = { accept: "Accept invitation", pending: "Joining…" } }: AcceptInvitationFormProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? labels.pending : labels.accept}
      </Button>
    </form>
  );
}
