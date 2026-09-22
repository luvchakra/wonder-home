"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { updatePetAction } from "../(auth)/home-actions";

export type PetProfileInitial = {
  name: string;
  species: string;
  dateOfBirth: string | null;
  vetName: string | null;
  vetContact: string | null;
  notes: string | null;
};

/** The other half of `AddPetForm` (rule 12): correcting a pet's own details after the fact. */
export function PetProfileForm({
  householdId,
  petId,
  initial,
}: {
  householdId: string;
  petId: string;
  initial: PetProfileInitial;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updatePetAction, {});

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={`Edit ${initial.name}'s details`} title="Edit details">
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={`${initial.name}'s details`} description="Blank fields stay blank — nothing here is guessed.">
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="petId" value={petId} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" name="name" required defaultValue={initial.name} autoComplete="off" />
            <Field label="Species" name="species" required defaultValue={initial.species} autoComplete="off" />
          </div>
          <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={initial.dateOfBirth ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vet name" name="vetName" defaultValue={initial.vetName ?? ""} autoComplete="off" />
            <Field label="Vet contact" name="vetContact" defaultValue={initial.vetContact ?? ""} autoComplete="off" />
          </div>
          <Field label="Notes" name="notes" defaultValue={initial.notes ?? ""} autoComplete="off" />

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save details"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
