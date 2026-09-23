"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { GENDER_OPTIONS } from "@wonderhome/core/identity/member-details";

import type { ActionState } from "../(auth)/actions";
import { addChildAction } from "../(auth)/household-actions";
import { GenderField } from "./gender-field";

export function AddChildForm({ householdId }: { householdId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addChildAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a child</CardTitle>
      </CardHeader>

      <form action={formAction} className="space-y-4">
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

        <p className="text-sm text-[var(--wh-foreground-muted)]">
          A child does not need an account. You stay their guardian, and what they can see
          changes with their age.
        </p>

        <input type="hidden" name="householdId" value={householdId} />
        <Field label="Their name" name="displayName" required autoComplete="off" />
        <Field
          label="Date of birth"
          name="dateOfBirth"
          type="date"
          hint="Optional. Used to keep their view age-appropriate."
        />
        <GenderField options={GENDER_OPTIONS} />

        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add child"}
        </Button>
      </form>
    </Card>
  );
}
