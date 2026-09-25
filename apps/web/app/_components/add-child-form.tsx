"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { GENDER_OPTIONS } from "@wonderhome/core/identity/member-details";

import type { ActionState } from "../(auth)/actions";
import { addChildAction } from "../(auth)/household-actions";
import type { MemberFormLabels } from "../_lib/member-form-labels";
import { GenderField } from "./gender-field";

export function AddChildForm({ householdId, labels }: { householdId: string; labels: MemberFormLabels }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addChildAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.addChild}</CardTitle>
      </CardHeader>

      <form action={formAction} className="space-y-4">
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

        <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.addChildLede}</p>

        <input type="hidden" name="householdId" value={householdId} />
        <Field label={labels.theirName} name="displayName" required autoComplete="off" />
        <Field label={labels.dateOfBirth} name="dateOfBirth" type="date" hint={labels.dateOfBirthHint} />
        <GenderField options={GENDER_OPTIONS} labels={labels.gender} />

        <Button type="submit" disabled={pending}>
          {pending ? labels.adding : labels.addChildSubmit}
        </Button>
      </form>
    </Card>
  );
}
