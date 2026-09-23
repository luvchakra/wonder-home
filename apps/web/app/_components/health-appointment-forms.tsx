"use client";

import { Ban, ChevronLeft, ChevronRight, CircleCheck, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { startTransition, useActionState, useState } from "react";

import type { AppointmentType } from "@wonderhome/core/health/appointments";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";
import { Switch } from "@wonderhome/core/ui/switch";

import type { ActionState } from "../(auth)/actions";
import { createAppointmentAction, setAppointmentStatusAction } from "../(auth)/health-appointment-actions";

const TYPE_OPTIONS: { value: AppointmentType; label: string }[] = [
  { value: "doctor", label: "Doctor" },
  { value: "dentist", label: "Dentist" },
  { value: "eye_care", label: "Eye care" },
  { value: "physiotherapy", label: "Physiotherapy" },
  { value: "dermatology", label: "Dermatology" },
  { value: "specialist", label: "Specialist" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "vaccination", label: "Vaccination" },
  { value: "mental_wellness", label: "Mental wellness" },
  { value: "other", label: "Other" },
];

const SCOPE_OPTIONS = [
  { value: "private", label: "Only me" },
  { value: "selected_family", label: "People I choose" },
  { value: "household_operational", label: "The whole household" },
] as const;

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEP_LABEL = ["Who", "What", "When", "Where", "Notes", "Reminders"] as const;

/**
 * Booking an appointment — progressive entry (who → what → when → where →
 * notes → reminder → save), never a giant form (story 21-002's own
 * acceptance criterion). Every step's fields stay mounted in the DOM (just
 * hidden) so the final submit carries the whole form in one `FormData`,
 * rather than needing to stitch several steps' state back together by hand.
 */
export function BookAppointmentButton({
  householdId,
  members,
  defaultPrivacyScope,
  checkupId,
  defaultMemberId,
  defaultAppointmentType = "doctor",
  trigger,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  /** Links the booked appointment to a checkup (story 21-004) — completing it will mark that checkup done. */
  checkupId?: string;
  defaultMemberId?: string;
  defaultAppointmentType?: AppointmentType;
  /** A custom trigger, for a checkup row's own contextual "Book" action instead of the generic header pill. */
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createAppointmentAction, {});
  const [memberId, setMemberId] = useState(defaultMemberId ?? members[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState("");

  const close = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep(0);
      setStartsAt("");
    }
  };

  if (members.length === 0) return null;

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
          <Plus aria-hidden className="size-3.5" /> Book an appointment
        </Pill>
      )}

      <Sheet open={open} onOpenChange={close} title="Book an appointment" description={`Step ${step + 1} of 6 — ${STEP_LABEL[step]}`}>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="memberDisplayName" value={members.find((m) => m.id === memberId)?.displayName ?? ""} />
          {checkupId ? <input type="hidden" name="checkupId" value={checkupId} /> : null}

          <div className={step === 0 ? "space-y-3" : "hidden"}>
            <Select label="Who is this for?" name="memberId" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </div>

          <div className={step === 1 ? "space-y-3" : "hidden"}>
            <Select label="What kind of appointment?" name="appointmentType" defaultValue={defaultAppointmentType}>
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className={step === 2 ? "space-y-3" : "hidden"}>
            <Field
              label="Starts"
              name="startsAt"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              error={step === 2 && state.error && !startsAt ? "Choose when this starts." : undefined}
            />
            <Field label="Ends (optional)" name="endsAt" type="datetime-local" hint="Used to check for a clash with anything else already booked." />
          </div>

          <div className={step === 3 ? "space-y-3" : "hidden"}>
            <Field label="Provider (optional)" name="provider" placeholder="Dr. Mehta" autoComplete="off" />
            <Field label="Facility (optional)" name="facility" placeholder="City Clinic" autoComplete="off" />
            <Field label="Location (optional)" name="location" placeholder="MG Road" autoComplete="off" />
          </div>

          <div className={step === 4 ? "space-y-3" : "hidden"}>
            <Field label="To prepare (optional)" name="preparationNotes" placeholder="Fast for 8 hours" autoComplete="off" />
            <Field label="Notes (optional)" name="notes" placeholder="Anything else worth remembering" autoComplete="off" />
            <Select label="Who can see this" name="privacyScope" defaultValue={defaultPrivacyScope}>
              {SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className={step === 5 ? "space-y-3" : "hidden"}>
            <ReminderToggle name="remindAdvance" label="Remind me a few days before" defaultChecked />
            <ReminderToggle name="remindPreparation" label="Remind me to prepare" />
            <ReminderToggle name="remindDayOf" label="Remind me on the day" defaultChecked />
            <ReminderToggle name="calendarSync" label="Show on the household calendar" hint="Only when this is visible to the whole household." />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)} className="gap-1">
                <ChevronLeft aria-hidden className="size-4" /> Back
              </Button>
            ) : (
              <span />
            )}
            {step < 5 ? (
              <Button
                key="next"
                type="button"
                onClick={() => setStep((s) => (s + 1) as Step)}
                disabled={step === 2 && !startsAt}
                className="gap-1"
              >
                Next <ChevronRight aria-hidden className="size-4" />
              </Button>
            ) : (
              <Button key="submit" type="submit" disabled={pending || !startsAt}>
                {pending ? "Booking…" : "Book appointment"}
              </Button>
            )}
          </div>
        </form>
      </Sheet>
    </>
  );
}

function ReminderToggle({ name, label, hint, defaultChecked = false }: { name: string; label: string; hint?: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{hint}</p> : null}
      </div>
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
      <Switch checked={checked} onCheckedChange={setChecked} label={label} />
    </div>
  );
}

/** Confirm, complete or cancel — the manual status actions alongside whatever HomeBrain proposes. */
export function AppointmentStatusActions({
  householdId,
  appointmentId,
  status,
}: {
  householdId: string;
  appointmentId: string;
  status: "proposed" | "confirmed" | "completed" | "cancelled" | "rescheduled";
}) {
  const [, formAction, pending] = useActionState<ActionState, FormData>(setAppointmentStatusAction, {});

  const submit = (next: string) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("appointmentId", appointmentId);
    formData.set("status", next);
    startTransition(() => formAction(formData));
  };

  if (status === "proposed") {
    return (
      <div className="flex gap-1.5">
        <Pill type="button" tone="soft" disabled={pending} onClick={() => submit("confirmed")} aria-label="Confirm appointment" title="Confirm">
          <CircleCheck aria-hidden className="size-3.5" />
        </Pill>
        <Pill type="button" tone="quiet" disabled={pending} onClick={() => submit("cancelled")} aria-label="Cancel appointment" title="Cancel">
          <Ban aria-hidden className="size-3.5" />
        </Pill>
      </div>
    );
  }

  if (status === "confirmed") {
    return (
      <div className="flex gap-1.5">
        <Pill type="button" tone="soft" disabled={pending} onClick={() => submit("completed")} aria-label="Mark appointment complete" title="Complete">
          <CircleCheck aria-hidden className="size-3.5" />
        </Pill>
        <Pill type="button" tone="quiet" disabled={pending} onClick={() => submit("cancelled")} aria-label="Cancel appointment" title="Cancel">
          <Ban aria-hidden className="size-3.5" />
        </Pill>
      </div>
    );
  }

  return null;
}
