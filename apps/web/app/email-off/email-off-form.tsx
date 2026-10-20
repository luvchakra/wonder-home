"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

type State = { done?: boolean; error?: boolean };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {label}
    </Button>
  );
}

export function EmailOffForm({ member, token, action, labels }: { member: string; token: string; action: (state: State, formData: FormData) => Promise<State>; labels: { button: string; done: string; invalid: string } }) {
  const [state, run] = useActionState(action, {});
  if (state.done) return <Alert tone="info">{labels.done}</Alert>;
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="m" value={member} />
      <input type="hidden" name="t" value={token} />
      {state.error ? <Alert>{labels.invalid}</Alert> : null}
      <Submit label={labels.button} />
    </form>
  );
}
