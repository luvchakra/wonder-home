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
import type { HealthFormLabels } from "../_lib/health-form-labels";

/** The stored values, in the order they are offered; their words come from `labels` (story 22-004). */
const TYPES: AppointmentType[] = ["doctor", "dentist", "eye_care", "physiotherapy", "dermatology", "specialist", "diagnostic", "vaccination", "mental_wellness", "other"];

const SCOPES = ["private", "selected_family", "household_operational"] as const;

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEP_COUNT = 6;

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
  labels,
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
  labels: HealthFormLabels;
}) {
  const words = labels.appointment;
  const common = labels.common;
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
          <Plus aria-hidden className="size-3.5" /> {words.add}
        </Pill>
      )}

      <Sheet open={open} onOpenChange={close} title={words.add}
        description={words.step.replace("{current}", String(step + 1)).replace("{total}", String(STEP_COUNT)).replace("{label}", () => words.steps[step])}>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="memberDisplayName" value={members.find((m) => m.id === memberId)?.displayName ?? ""} />
          {checkupId ? <input type="hidden" name="checkupId" value={checkupId} /> : null}

          <div className={step === 0 ? "space-y-3" : "hidden"}>
            <Select label={common.whoFor} name="memberId" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </div>

          <div className={step === 1 ? "space-y-3" : "hidden"}>
            <Select label={words.kind} name="appointmentType" defaultValue={defaultAppointmentType}>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {labels.careTypes[type]}
                </option>
              ))}
            </Select>
          </div>

          <div className={step === 2 ? "space-y-3" : "hidden"}>
            <Field
              label={words.starts}
              name="startsAt"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              error={step === 2 && state.error && !startsAt ? words.startsMissing : undefined}
            />
            <Field label={words.ends} name="endsAt" type="datetime-local" hint={words.endsHint} />
          </div>

          <div className={step === 3 ? "space-y-3" : "hidden"}>
            <Field label={words.provider} name="provider" placeholder={words.providerPlaceholder} autoComplete="off" />
            <Field label={words.facility} name="facility" placeholder={words.facilityPlaceholder} autoComplete="off" />
            <Field label={words.location} name="location" placeholder={words.locationPlaceholder} autoComplete="off" />
          </div>

          <div className={step === 4 ? "space-y-3" : "hidden"}>
            <Field label={words.prepare} name="preparationNotes" placeholder={words.preparePlaceholder} autoComplete="off" />
            <Field label={common.notes} name="notes" placeholder={common.notesPlaceholderElse} autoComplete="off" />
            <Select label={common.whoCanSee} name="privacyScope" defaultValue={defaultPrivacyScope}>
              {SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {labels.scopes[scope]}
                </option>
              ))}
            </Select>
          </div>

          <div className={step === 5 ? "space-y-3" : "hidden"}>
            <ReminderToggle name="remindAdvance" label={words.remindAdvance} defaultChecked />
            <ReminderToggle name="remindPreparation" label={words.remindPreparation} />
            <ReminderToggle name="remindDayOf" label={words.remindDayOf} defaultChecked />
            <ReminderToggle name="calendarSync" label={words.calendarSync} hint={words.calendarSyncHint} />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)} className="gap-1">
                <ChevronLeft aria-hidden className="size-4" /> {common.back}
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
                {common.next} <ChevronRight aria-hidden className="size-4" />
              </Button>
            ) : (
              <Button key="submit" type="submit" disabled={pending || !startsAt}>
                {pending ? words.booking : words.submit}
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
  labels,
}: {
  householdId: string;
  appointmentId: string;
  status: "proposed" | "confirmed" | "completed" | "cancelled" | "rescheduled";
  labels: HealthFormLabels;
}) {
  const words = labels.appointment;
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
        <Pill type="button" tone="soft" disabled={pending} onClick={() => submit("confirmed")} aria-label={words.confirmLabel} title={words.confirm}>
          <CircleCheck aria-hidden className="size-3.5" />
        </Pill>
        <Pill type="button" tone="quiet" disabled={pending} onClick={() => submit("cancelled")} aria-label={words.cancelLabel} title={words.cancel}>
          <Ban aria-hidden className="size-3.5" />
        </Pill>
      </div>
    );
  }

  if (status === "confirmed") {
    return (
      <div className="flex gap-1.5">
        <Pill type="button" tone="soft" disabled={pending} onClick={() => submit("completed")} aria-label={words.completeLabel} title={words.complete}>
          <CircleCheck aria-hidden className="size-3.5" />
        </Pill>
        <Pill type="button" tone="quiet" disabled={pending} onClick={() => submit("cancelled")} aria-label={words.cancelLabel} title={words.cancel}>
          <Ban aria-hidden className="size-3.5" />
        </Pill>
      </div>
    );
  }

  return null;
}
