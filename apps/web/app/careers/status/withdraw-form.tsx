"use client";

import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import { withdrawAction, type WithdrawState } from "../actions";

/** Withdrawing asks first; the token goes to this app's server in the form body. */
export function WithdrawForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<WithdrawState, FormData>(withdrawAction, { status: "idle" });
  const [asking, setAsking] = useState(false);

  if (state.status === "done") {
    return (
      <p role="status" className="text-sm font-medium">
        Your application is withdrawn ({state.application.statusLabel}). WonderJobs will email you a confirmation.
      </p>
    );
  }
  if (!asking) {
    return (
      <Button type="button" variant="secondary" onClick={() => setAsking(true)}>
        Withdraw my application
      </Button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="token" value={token} />
      <p className="text-sm">Withdraw this application? The team will stop considering you for this role. This can&rsquo;t be undone.</p>
      {state.status === "error" ? <Alert>{state.message}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Withdrawing…" : "Yes, withdraw"}</Button>
        <Button type="button" variant="quiet" onClick={() => setAsking(false)} disabled={pending}>Keep my application</Button>
      </div>
    </form>
  );
}
