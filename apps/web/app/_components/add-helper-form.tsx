"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";

import type { ActionState } from "../(auth)/actions";
import { addHelperAction } from "../(auth)/household-actions";
import type { MemberFormLabels } from "../_lib/member-form-labels";
import { MemberDetailFields } from "./member-detail-fields";

/** The other accountless member — same shape as `AddChildForm`, for a househelper. */
export function AddHelperForm({ householdId, labels }: { householdId: string; labels: MemberFormLabels }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addHelperAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.addHelper}</CardTitle>
      </CardHeader>

      <form action={formAction} className="space-y-4">
        {state.error ? <Alert>{state.error}</Alert> : null}

        <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.addHelperLede}</p>

        <input type="hidden" name="householdId" value={householdId} />
        <Field label={labels.theirName} name="displayName" required autoComplete="off" />
        <MemberDetailFields labels={{ notes: labels.notes, notesPlaceholder: labels.notesPlaceholder, gender: labels.gender }} />

        <Button type="submit" disabled={pending}>
          {pending ? labels.adding : labels.addHelperSubmit}
        </Button>
      </form>
    </Card>
  );
}
