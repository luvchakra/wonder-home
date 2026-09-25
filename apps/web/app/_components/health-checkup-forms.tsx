"use client";

import { Ban, CalendarPlus, CircleCheck, Pencil, Plus, RotateCcw } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import type { AppointmentType } from "@wonderhome/core/health/appointments";
import type { CheckupType } from "@wonderhome/core/health/checkups";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  completeCheckupAction,
  createCheckupAction,
  dismissCheckupAction,
  reactivateCheckupAction,
  updateCheckupAction,
} from "../(auth)/health-checkup-actions";
import { withName, type HealthFormLabels } from "../_lib/health-form-labels";
import { BookAppointmentButton } from "./health-appointment-forms";

/** The stored values, in the order they are offered; their words come from `labels` (story 22-004). */
const TYPES: CheckupType[] = ["doctor", "dentist", "eye_care", "physiotherapy", "dermatology", "specialist", "diagnostic", "vaccination", "screening", "other"];

/** Checkups and appointments carry slightly different type lists (screening has no appointment equivalent) — this bridges the one gap. */
const CHECKUP_TYPE_TO_APPOINTMENT_TYPE: Record<CheckupType, AppointmentType> = {
  doctor: "doctor",
  dentist: "dentist",
  eye_care: "eye_care",
  physiotherapy: "physiotherapy",
  dermatology: "dermatology",
  specialist: "specialist",
  diagnostic: "diagnostic",
  vaccination: "vaccination",
  screening: "diagnostic",
  other: "other",
};

/** Days between checkups, stored as they are; "" is a one-off. */
const CADENCES = ["", "90", "180", "365", "730"] as const;

const SCOPES = ["private", "selected_family", "household_operational"] as const;

/** Adding a checkup — a household-configured recurring commitment, never one WonderHome invents (story 21-004). */
export function AddCheckupButton({
  householdId,
  members,
  defaultPrivacyScope,
  labels,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  labels: HealthFormLabels;
}) {
  const words = labels.checkup;
  const common = labels.common;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCheckupAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      setOpen(false);
      submitted.current = false;
    }
  }, [pending, state.error]);

  if (members.length === 0) return null;

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {words.add}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={words.add} description={common.householdCommitment}>
        <form
          action={(formData) => {
            submitted.current = true;
            formAction(formData);
          }}
          className="space-y-3"
        >
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Select label={common.whoFor} name="memberId" defaultValue={members[0]?.id ?? ""}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <Field label={words.whatsDue} name="label" placeholder={words.whatsDuePlaceholder} required autoComplete="off" />
          <Select label={words.type} name="checkupType" defaultValue="dentist">
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {labels.careTypes[type]}
              </option>
            ))}
          </Select>
          <Select label={common.repeats} name="cadenceDays" defaultValue="">
            {CADENCES.map((cadence) => (
              <option key={cadence} value={cadence}>
                {words.cadence[cadence]}
              </option>
            ))}
          </Select>
          <Field label={common.nextDue} name="nextDueOn" type="date" required />
          <Field label={common.notes} name="notes" placeholder={common.notesPlaceholder} autoComplete="off" />
          <Select label={common.whoCanSee} name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {labels.scopes[scope]}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.adding : words.submit}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Editing a checkup — content, cadence and its next due date all in one sheet, so a row needs only one edit action. */
export function EditCheckupButton({
  householdId,
  checkupId,
  label,
  notes,
  nextDueOn,
  labels,
}: {
  householdId: string;
  checkupId: string;
  label: string;
  notes: string | null;
  nextDueOn: string;
  labels: HealthFormLabels;
}) {
  const words = labels.checkup;
  const common = labels.common;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateCheckupAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      setOpen(false);
      submitted.current = false;
    }
  }, [pending, state.error]);

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={withName(common.editNamed, label)} title={common.edit}>
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={words.editTitle} description={words.editDescription}>
        <form
          action={(formData) => {
            submitted.current = true;
            formAction(formData);
          }}
          className="space-y-3"
        >
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="checkupId" value={checkupId} />
          <Field label={words.whatsDue} name="label" defaultValue={label} required autoComplete="off" />
          <Field label={common.nextDue} name="nextDueOn" type="date" defaultValue={nextDueOn} required />
          <Field label={common.notes} name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.saving : common.save}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/**
 * A checkup row's actions — mark done, book the next appointment for it,
 * edit (content, cadence and due date together) or remove (and bring back
 * once removed), so every checkup can be added, updated and removed
 * (CLAUDE.md rule 12). Kept to four icons at most — a fifth (a separate
 * reschedule action) crowded the title at phone width, so it lives inside
 * the edit sheet instead.
 */
export function CheckupActions({
  householdId,
  checkup,
  members,
  defaultPrivacyScope,
  labels,
}: {
  householdId: string;
  checkup: {
    id: string;
    memberId: string;
    label: string;
    notes: string | null;
    checkupType: CheckupType;
    nextDueOn: string;
    status: "active" | "dismissed";
    linkedAppointmentId: string | null;
  };
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  labels: HealthFormLabels;
}) {
  const common = labels.common;
  const [, completeAction, completePending] = useActionState<ActionState, FormData>(completeCheckupAction, {});
  const [, dismissAction, dismissPending] = useActionState<ActionState, FormData>(dismissCheckupAction, {});
  const [, reactivateAction, reactivatePending] = useActionState<ActionState, FormData>(reactivateCheckupAction, {});

  const submit = (action: (formData: FormData) => void) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("checkupId", checkup.id);
    startTransition(() => action(formData));
  };

  if (checkup.status === "dismissed") {
    return (
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label={common.bringBack} title={common.bringBack}>
        <RotateCcw aria-hidden className="size-3.5" />
      </Pill>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill type="button" tone="soft" disabled={completePending} onClick={() => submit(completeAction)} aria-label={common.markDone} title={common.markDone}>
        <CircleCheck aria-hidden className="size-3.5" />
      </Pill>
      {!checkup.linkedAppointmentId ? (
        <BookAppointmentButton
          householdId={householdId}
          members={members}
          defaultPrivacyScope={defaultPrivacyScope}
          checkupId={checkup.id}
          defaultMemberId={checkup.memberId}
          defaultAppointmentType={CHECKUP_TYPE_TO_APPOINTMENT_TYPE[checkup.checkupType]}
          labels={labels}
          trigger={
            <Pill type="button" tone="quiet" aria-label={labels.checkup.bookLabel} title={labels.checkup.book}>
              <CalendarPlus aria-hidden className="size-3.5" />
            </Pill>
          }
        />
      ) : null}
      <EditCheckupButton householdId={householdId} checkupId={checkup.id} label={checkup.label} notes={checkup.notes} nextDueOn={checkup.nextDueOn} labels={labels} />
      <Pill type="button" tone="quiet" disabled={dismissPending} onClick={() => submit(dismissAction)} aria-label={common.remove} title={common.remove}>
        <Ban aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
