"use client";

import { Pencil } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import type { DayHours } from "@wonderhome/core/household/day-hours";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { updateMemberProfileAction } from "../(auth)/household-actions";
import { HELPER_ROLES, splitHelperRoles } from "../_lib/helper-roles";
import { MemberDetailFields } from "./member-detail-fields";

/** A househelper's "what they do", ticked rather than typed, in the viewer's language. */
export type HelperRoleWords = { legend: string; other: string; placeholder: string; roles: Record<string, string> };

export type MemberProfileInitial = {
  displayName: string;
  dateOfBirth: string | null;
  nickname: string | null;
  nicknamePreferred?: boolean;
  relationship: string | null;
  occupation: string | null;
  schoolOrWorkLocation: string | null;
  specialOccasionLabel: string | null;
  specialOccasionDate: string | null;
  gender: string | null;
  notes: string | null;
  /** Shapes which of the day's fields apply: an adult's work, a child's school. */
  memberType?: "adult" | "child" | "helper";
  workArrangement?: string | null;
  /** An adult's usual working day: what "after work" means to HomeTalk. */
  workHours?: DayHours | null;
  /** A child's current school and its day, when a school is on record. */
  school?: { schoolName: string; hours: DayHours | null } | null;
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
  helperRoles,
  workOptions,
}: {
  householdId: string;
  memberId: string;
  initial: MemberProfileInitial;
  /** Set for a househelper: everything they do, as checkboxes, in place of a free-text occupation. */
  helperRoles?: HelperRoleWords;
  /** How an adult may work, as the picker offers it (rule 20). */
  workOptions?: readonly { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateMemberProfileAction, {});

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={`Edit ${initial.displayName}'s details`} title="Edit details">
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={`${initial.displayName}'s details`} description="Blank fields stay blank — nothing here is guessed.">
        <form
          className="space-y-4"
          // Submitted by hand rather than as a form action, so a refusal
          // ("give both a start and an end") leaves what was typed in place
          // instead of resetting every field.
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(() => formAction(data));
          }}
        >
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="memberId" value={memberId} />

          <Field label="Name" name="displayName" required defaultValue={initial.displayName} autoComplete="off" />
          <Field label="Nickname" name="nickname" defaultValue={initial.nickname ?? ""} placeholder="What the household actually calls them" autoComplete="off" />
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" name="nicknamePreferred" defaultChecked={initial.nicknamePreferred ?? false} className="size-5 shrink-0 accent-[var(--wh-primary)]" />
            Preferred name: call them by their nickname
          </label>
          <Field label="Family calls me" name="relationship" defaultValue={initial.relationship ?? ""} placeholder="Father, Mother, Daughter, Grandmother…" autoComplete="off" />
          <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={initial.dateOfBirth ?? ""} />
          {helperRoles ? (
            <div className="space-y-2">
              {/* Tells the action the occupation is these ticks, so un-ticking them all clears it. */}
              <input type="hidden" name="helperRolesField" value="1" />
              <ChoiceChips
                legend={helperRoles.legend}
                name="helperRoles"
                type="checkbox"
                options={HELPER_ROLES.map((role) => ({ value: role, label: helperRoles.roles[role] ?? role }))}
                defaultValue={splitHelperRoles(initial.occupation).known}
              />
              <Field label={helperRoles.other} name="helperRoles_other" defaultValue={splitHelperRoles(initial.occupation).other} placeholder={helperRoles.placeholder} autoComplete="off" maxLength={40} />
            </div>
          ) : (
            <Field label="Occupation" name="occupation" defaultValue={initial.occupation ?? ""} placeholder="What they do for work or study" autoComplete="off" />
          )}
          <Field label="School or work location" name="schoolOrWorkLocation" defaultValue={initial.schoolOrWorkLocation ?? ""} placeholder="Where they spend the day" autoComplete="off" />

          {initial.memberType === "adult" ? (
            <fieldset className="space-y-3">
              <legend className="sr-only">Work</legend>
              <input type="hidden" name="workField" value="1" />
              <Select label="How they work" name="workArrangement" defaultValue={initial.workArrangement ?? ""}>
                <option value="">Not said</option>
                {(workOptions ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Work starts" name="workStarts" type="time" defaultValue={initial.workHours?.starts ?? ""} />
                <Field label="Work ends" name="workEnds" type="time" defaultValue={initial.workHours?.ends ?? ""} />
              </div>
              <p className="text-xs text-[var(--wh-foreground-subtle)]">Optional. HomeTalk uses this when they ask for something after work.</p>
            </fieldset>
          ) : null}

          {initial.memberType === "child" && initial.school ? (
            <fieldset className="space-y-3">
              <input type="hidden" name="schoolHoursField" value="1" />
              <legend className="text-sm font-medium">School hours at {initial.school.schoolName}</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="School starts" name="schoolStarts" type="time" defaultValue={initial.school.hours?.starts ?? ""} />
                <Field label="School ends" name="schoolEnds" type="time" defaultValue={initial.school.hours?.ends ?? ""} />
              </div>
              <p className="text-xs text-[var(--wh-foreground-subtle)]">Optional. HomeTalk uses this when someone asks for something after school.</p>
            </fieldset>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Special occasion" name="specialOccasionLabel" defaultValue={initial.specialOccasionLabel ?? ""} placeholder="Anniversary, graduation…" autoComplete="off" />
            <Field label="Date" name="specialOccasionDate" type="date" defaultValue={initial.specialOccasionDate ?? ""} />
          </div>

          <MemberDetailFields gender={initial.gender} notes={initial.notes} />

          {/* Said again beside the button, where a phone's eye is; the alert above is what is announced. */}
          {state.error ? (
            <p aria-hidden className="text-sm text-[var(--wh-risk)]">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save details"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
