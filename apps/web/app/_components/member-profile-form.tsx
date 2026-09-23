"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { updateMemberProfileAction } from "../(auth)/household-actions";
import { MemberDetailFields } from "./member-detail-fields";

export type MemberProfileInitial = {
  displayName: string;
  dateOfBirth: string | null;
  nickname: string | null;
  relationship: string | null;
  occupation: string | null;
  schoolOrWorkLocation: string | null;
  specialOccasionLabel: string | null;
  specialOccasionDate: string | null;
  gender: string | null;
  notes: string | null;
};

/**
 * The other half of adding someone (rule 12): every field a household can
 * set about a person at creation, plus the details nowhere else lets them
 * set at all — nickname, relationship, occupation, where the day is spent,
 * a date worth remembering besides a birthday, gender and notes.
 *
 * A pill rather than a full-width label, matching `MemberRoleControl` and
 * `RemoveMemberControl` beside it — the row keeps its width for the name
 * (design principle 11).
 */
export function MemberProfileForm({
  householdId,
  memberId,
  initial,
}: {
  householdId: string;
  memberId: string;
  initial: MemberProfileInitial;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateMemberProfileAction, {});

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={`Edit ${initial.displayName}'s details`} title="Edit details">
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={`${initial.displayName}'s details`} description="Blank fields stay blank — nothing here is guessed.">
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="memberId" value={memberId} />

          <Field label="Name" name="displayName" required defaultValue={initial.displayName} autoComplete="off" />
          <Field label="Nickname" name="nickname" defaultValue={initial.nickname ?? ""} placeholder="What the household actually calls them" autoComplete="off" />
          <Field label="Family calls me" name="relationship" defaultValue={initial.relationship ?? ""} placeholder="Father, Mother, Daughter, Grandmother…" autoComplete="off" />
          <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={initial.dateOfBirth ?? ""} />
          <Field label="Occupation" name="occupation" defaultValue={initial.occupation ?? ""} placeholder="What they do for work or study" autoComplete="off" />
          <Field label="School or work location" name="schoolOrWorkLocation" defaultValue={initial.schoolOrWorkLocation ?? ""} placeholder="Where they spend the day" autoComplete="off" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Special occasion" name="specialOccasionLabel" defaultValue={initial.specialOccasionLabel ?? ""} placeholder="Anniversary, graduation…" autoComplete="off" />
            <Field label="Date" name="specialOccasionDate" type="date" defaultValue={initial.specialOccasionDate ?? ""} />
          </div>

          <MemberDetailFields gender={initial.gender} notes={initial.notes} />

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save details"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
