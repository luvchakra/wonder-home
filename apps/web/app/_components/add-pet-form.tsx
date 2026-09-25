"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { PET_GENDER_OPTIONS } from "@wonderhome/core/home/pets";

import type { ActionState } from "../(auth)/actions";
import { createPetAction } from "../(auth)/home-actions";
import type { MemberFormLabels } from "../_lib/member-form-labels";
import { GenderField } from "./gender-field";

/**
 * Adding a pet alongside inviting a person (product feedback: "under family
 * tab, under invite, add option to add a pet, let should be treated as
 * family"). Pets aren't `household_members` rows — no account, no roles —
 * but they get the same one-form-per-kind-of-addition treatment as
 * `AddChildForm`/`AddHelperForm` right beside them.
 */
export function AddPetForm({ householdId, labels }: { householdId: string; labels: MemberFormLabels }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPetAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.addPet}</CardTitle>
      </CardHeader>

      <form action={formAction} className="space-y-4">
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

        <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.addPetLede}</p>

        <input type="hidden" name="householdId" value={householdId} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={labels.petName} name="name" required autoComplete="off" />
          <Field label={labels.species} name="species" required placeholder={labels.speciesPlaceholder} autoComplete="off" />
        </div>
        <Field label={labels.petDateOfBirth} name="dateOfBirth" type="date" />
        <GenderField options={PET_GENDER_OPTIONS} labels={labels.gender} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={labels.vetName} name="vetName" autoComplete="off" />
          <Field label={labels.vetContact} name="vetContact" autoComplete="off" />
        </div>
        <Field label={labels.notes} name="notes" autoComplete="off" />

        <Button type="submit" disabled={pending}>
          {pending ? labels.adding : labels.addPetSubmit}
        </Button>
      </form>
    </Card>
  );
}
