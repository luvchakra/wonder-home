"use client";

import { Ban, CalendarPlus, CircleCheck, Pencil, Plus, RotateCcw } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

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
import { BookAppointmentButton } from "./health-appointment-forms";

const TYPE_OPTIONS: { value: CheckupType; label: string }[] = [
  { value: "doctor", label: "Doctor" },
  { value: "dentist", label: "Dentist" },
  { value: "eye_care", label: "Eye care" },
  { value: "physiotherapy", label: "Physiotherapy" },
  { value: "dermatology", label: "Dermatology" },
  { value: "specialist", label: "Specialist" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "vaccination", label: "Vaccination" },
  { value: "screening", label: "Screening" },
  { value: "other", label: "Other" },
];

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

const CADENCE_OPTIONS = [
  { value: "", label: "One-off — no repeat" },
  { value: "90", label: "Every 3 months" },
  { value: "180", label: "Every 6 months" },
  { value: "365", label: "Every year" },
  { value: "730", label: "Every 2 years" },
] as const;

const SCOPE_OPTIONS = [
  { value: "private", label: "Only me" },
  { value: "selected_family", label: "People I choose" },
  { value: "household_operational", label: "The whole household" },
] as const;

/** Adding a checkup — a household-configured recurring commitment, never one WonderHome invents (story 21-004). */
export function AddCheckupButton({
  householdId,
  members,
  defaultPrivacyScope,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
}) {
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
        <Plus aria-hidden className="size-3.5" /> Add a checkup
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Add a checkup" description="A recurring commitment your household set, not one WonderHome invents.">
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
          <Select label="Who is this for?" name="memberId" defaultValue={members[0]?.id ?? ""}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <Field label="What's due" name="label" placeholder="Dental cleaning" required autoComplete="off" />
          <Select label="Type" name="checkupType" defaultValue="dentist">
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select label="Repeats" name="cadenceDays" defaultValue="">
            {CADENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Field label="Next due" name="nextDueOn" type="date" required />
          <Field label="Notes (optional)" name="notes" placeholder="Anything worth remembering" autoComplete="off" />
          <Select label="Who can see this" name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add checkup"}
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
}: {
  householdId: string;
  checkupId: string;
  label: string;
  notes: string | null;
  nextDueOn: string;
}) {
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
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={`Edit ${label}`} title="Edit">
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Edit checkup" description="Update what this says, or move its next due date.">
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
          <Field label="What's due" name="label" defaultValue={label} required autoComplete="off" />
          <Field label="Next due" name="nextDueOn" type="date" defaultValue={nextDueOn} required />
          <Field label="Notes (optional)" name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save"}
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
}) {
  const [, completeAction, completePending] = useActionState<ActionState, FormData>(completeCheckupAction, {});
  const [, dismissAction, dismissPending] = useActionState<ActionState, FormData>(dismissCheckupAction, {});
  const [, reactivateAction, reactivatePending] = useActionState<ActionState, FormData>(reactivateCheckupAction, {});

  const submit = (action: (formData: FormData) => void) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("checkupId", checkup.id);
    action(formData);
  };

  if (checkup.status === "dismissed") {
    return (
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label="Bring back" title="Bring back">
        <RotateCcw aria-hidden className="size-3.5" />
      </Pill>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill type="button" tone="soft" disabled={completePending} onClick={() => submit(completeAction)} aria-label="Mark done" title="Mark done">
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
          trigger={
            <Pill type="button" tone="quiet" aria-label="Book an appointment for this" title="Book">
              <CalendarPlus aria-hidden className="size-3.5" />
            </Pill>
          }
        />
      ) : null}
      <EditCheckupButton householdId={householdId} checkupId={checkup.id} label={checkup.label} notes={checkup.notes} nextDueOn={checkup.nextDueOn} />
      <Pill type="button" tone="quiet" disabled={dismissPending} onClick={() => submit(dismissAction)} aria-label="Remove" title="Remove">
        <Ban aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
