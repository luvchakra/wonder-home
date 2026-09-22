"use client";

import { PawPrint } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { reactivatePetAction, retirePetAction } from "../(auth)/home-actions";

/** The other half of adding a pet (rule 12): retiring them, or bringing them back — never a hard delete, so their care history stays. */
export function RetirePetControl({
  householdId,
  petId,
  name,
  active,
}: {
  householdId: string;
  petId: string;
  name: string;
  active: boolean;
}) {
  if (active) return <RetireButton householdId={householdId} petId={petId} name={name} />;
  return <ReactivateButton householdId={householdId} petId={petId} name={name} />;
}

function RetireButton({ householdId, petId, name }: { householdId: string; petId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(retirePetAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) setOpen(false);
  }, [pending, state.error]);

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={`Retire ${name}`} title={`Retire ${name}`}>
        <PawPrint aria-hidden className="size-3.5" />
      </Pill>

      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={`Retire ${name}?`}
        description={`${name} moves off the active roster. Their care history stays on record, and you can bring them back any time.`}
        confirmLabel="Retire"
        destructive
        pending={pending}
        onConfirm={() => {
          submitted.current = true;
          const formData = new FormData();
          formData.set("householdId", householdId);
          formData.set("petId", petId);
          formAction(formData);
        }}
      >
        {state.error ? <p className="text-sm text-[var(--wh-risk)]">{state.error}</p> : null}
      </ConfirmationSheet>
    </>
  );
}

function ReactivateButton({ householdId, petId, name }: { householdId: string; petId: string; name: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reactivatePetAction, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="petId" value={petId} />
      <Pill type="submit" tone="quiet" disabled={pending} aria-label={`Bring ${name} back`} title={`Bring ${name} back`}>
        <PawPrint aria-hidden className="size-3.5" /> {pending ? "…" : "Bring back"}
      </Pill>
      {state.error ? <p className="mt-1 text-xs text-[var(--wh-risk)]">{state.error}</p> : null}
    </form>
  );
}
