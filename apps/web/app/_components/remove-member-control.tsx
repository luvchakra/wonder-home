"use client";

import { UserRoundX } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { removeMemberAction } from "../(auth)/household-actions";
import type { MemberFormLabels } from "../_lib/member-form-labels";

const withName = (template: string, name: string) => template.replace(/\{name\}/g, () => name);

type RemoveLabels = Pick<MemberFormLabels, "remove" | "removeTitle" | "removeLede" | "removeConfirm">;

/** English, for a screen that does not pass its own words yet. */
const ENGLISH: RemoveLabels = {
  remove: "Remove {name}",
  removeTitle: "Remove {name}?",
  removeLede: "{name} will no longer be part of this household. What they were already part of stays on record — a past responsibility, a memory, an audit entry — but nothing new can be assigned to them.",
  removeConfirm: "Remove",
};

/**
 * The other half of adding someone: a household that can add a member could
 * not otherwise undo it. Hidden for the household's owner and for the acting
 * member's own row — neither is this control's to remove (see
 * `households.ts`'s `deactivateMember`, which refuses both server-side too).
 */
export function RemoveMemberControl({
  householdId,
  memberId,
  displayName,
  labels = ENGLISH,
}: {
  householdId: string;
  memberId: string;
  displayName: string;
  labels?: RemoveLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(removeMemberAction, {});
  const submitted = useRef(false);

  // Closes itself once the removal actually went through, rather than the
  // instant the button is pressed — an error stays on screen inside the
  // sheet instead of vanishing with it.
  useEffect(() => {
    if (submitted.current && !pending && !state.error) setOpen(false);
  }, [pending, state.error]);

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={withName(labels.remove, displayName)} title={withName(labels.remove, displayName)}>
        <UserRoundX aria-hidden className="size-3.5" />
      </Pill>

      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={withName(labels.removeTitle, displayName)}
        description={withName(labels.removeLede, displayName)}
        confirmLabel={labels.removeConfirm}
        destructive
        pending={pending}
        onConfirm={() => {
          submitted.current = true;
          const formData = new FormData();
          formData.set("householdId", householdId);
          formData.set("memberId", memberId);
          startTransition(() => formAction(formData));
        }}
      >
        {state.error ? <p className="text-sm text-[var(--wh-risk)]">{state.error}</p> : null}
      </ConfirmationSheet>
    </>
  );
}
