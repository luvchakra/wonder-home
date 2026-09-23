"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";
import { PET_GENDER_OPTIONS } from "@wonderhome/core/home/pets";

import type { ActionState } from "../(auth)/actions";
import { createPetAction } from "../(auth)/home-actions";
import { GenderField } from "./gender-field";

/**
 * Adding a pet alongside inviting a person (product feedback: "under family
 * tab, under invite, add option to add a pet, let should be treated as
 * family"). Pets aren't `household_members` rows — no account, no roles —
 * but they get the same one-form-per-kind-of-addition treatment as
 * `AddChildForm`/`AddHelperForm` right beside them.
 */
export function AddPetForm({ householdId }: { householdId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPetAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a pet</CardTitle>
      </CardHeader>

      <form action={formAction} className="space-y-4">
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

        <p className="text-sm text-[var(--wh-foreground-muted)]">
          Part of the family, on the Family tab alongside everyone else — vet details and notes
          stay with them for anyone helping to care for them.
        </p>

        <input type="hidden" name="householdId" value={householdId} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" name="name" required autoComplete="off" />
          <Field label="Species" name="species" required placeholder="Dog, cat, parakeet…" autoComplete="off" />
        </div>
        <Field label="Date of birth (optional)" name="dateOfBirth" type="date" />
        <GenderField options={PET_GENDER_OPTIONS} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vet name (optional)" name="vetName" autoComplete="off" />
          <Field label="Vet contact (optional)" name="vetContact" autoComplete="off" />
        </div>
        <Field label="Notes (optional)" name="notes" autoComplete="off" />

        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add pet"}
        </Button>
      </form>
    </Card>
  );
}
