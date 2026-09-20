"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";

import type { ActionState } from "../(auth)/actions";
import { addHelperAction } from "../(auth)/household-actions";

/** The other accountless member — same shape as `AddChildForm`, for a househelper. */
export function AddHelperForm({ householdId }: { householdId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addHelperAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a helper</CardTitle>
      </CardHeader>

      <form action={formAction} className="space-y-4">
        {state.error ? <Alert>{state.error}</Alert> : null}

        <p className="text-sm text-[var(--wh-foreground-muted)]">
          For someone who helps around the house but does not need an account of their own —
          their weekly pattern and any leave are recorded under Househelper.
        </p>

        <input type="hidden" name="householdId" value={householdId} />
        <Field label="Their name" name="displayName" required autoComplete="off" />

        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add helper"}
        </Button>
      </form>
    </Card>
  );
}
