"use client";

import { Ban, CircleCheck, Pencil, Plus, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import type { VitalType } from "@wonderhome/core/health/vitals";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { TextareaField } from "@wonderhome/core/ui/textarea-field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";
import { Switch } from "@wonderhome/core/ui/switch";

import type { ActionState } from "../(auth)/actions";
import {
  completeRoutineAction,
  createRoutineAction,
  dismissRoutineAction,
  reactivateRoutineAction,
  updateRoutineAction,
} from "../(auth)/health-measurement-routine-actions";
import { withName, type HealthFormLabels } from "../_lib/health-form-labels";
import { HealthPrivacyField } from "./health-privacy-field";
import { VitalUnitField } from "./health-vital-forms";

/** Days between measurements, stored as they are; their words come from `labels` (story 22-004). */
const CADENCES = ["1", "7", "14", "30"] as const;

/** Configuring a recurring measurement — the household's own commitment, never one WonderHome invents (story 21-007). */
export function AddRoutineButton({
  householdId,
  members,
  defaultPrivacyScope,
  labels,
  defaultOpen = false,
  hideTrigger = false,
  defaultMemberId,
  defaultVitalType = "blood_pressure",
  defaultCustomLabel,
  defaultCadenceDays = "7",
  defaultNextDueOn,
  defaultNotes,
  trigger,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  labels: HealthFormLabels;
  /** Prefills, for a suggestion that opens this sheet (a report's "track it at home", story 21-012); the person checks them and saves. */
  defaultMemberId?: string;
  defaultVitalType?: VitalType;
  defaultCustomLabel?: string;
  defaultCadenceDays?: (typeof CADENCES)[number];
  defaultNextDueOn?: string;
  defaultNotes?: string;
  /** A custom trigger in place of the Add pill. */
  trigger?: ReactNode;
  /** Opens as it mounts — picked from the page's Add menu rather than its own pill. */
  defaultOpen?: boolean;
  /** Leaves its own pill out, when the Add menu is how it is reached. */
  hideTrigger?: boolean;
}) {
  const words = labels.routine;
  const common = labels.common;
  const [open, setOpen] = useState(defaultOpen);
  const [vitalType, setVitalType] = useState<VitalType>(defaultVitalType);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createRoutineAction, {});
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
      {hideTrigger ? null : trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
          <Plus aria-hidden className="size-3.5" /> {words.add}
        </Pill>
      )}

      <Sheet open={open} onOpenChange={setOpen} title={words.title} description={common.householdCommitment}>
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
          <Select label={common.whoFor} name="memberId" defaultValue={defaultMemberId ?? members[0]?.id ?? ""}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <Select label={common.measurement} name="vitalType" value={vitalType} onChange={(event) => setVitalType(event.target.value as VitalType)}>
            {(Object.keys(labels.vitalTypes) as VitalType[]).map((type) => (
              <option key={type} value={type}>
                {labels.vitalTypes[type]}
              </option>
            ))}
          </Select>
          {vitalType === "custom" ? <Field label={common.whatCalled} name="customLabel" placeholder={common.measurementPlaceholder} defaultValue={defaultCustomLabel} required autoComplete="off" /> : null}
          <Select label={common.repeats} name="cadenceDays" defaultValue={defaultCadenceDays}>
            {CADENCES.map((cadence) => (
              <option key={cadence} value={cadence}>
                {words.cadence[cadence]}
              </option>
            ))}
          </Select>
          <Field label={common.preferredTime} name="preferredTime" type="time" />
          <Field label={words.firstDue} name="nextDueOn" type="date" defaultValue={defaultNextDueOn} required />
          <input type="hidden" name="reminderEnabled" value={reminderEnabled ? "true" : "false"} />
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm font-medium">{words.remind}</span>
            <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} label={words.remind} />
          </div>
          <TextareaField label={common.notes} name="notes" placeholder={common.notesPlaceholder} defaultValue={defaultNotes} />
          <HealthPrivacyField labels={labels} defaultValue={defaultPrivacyScope} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.adding : words.submit}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

export function EditRoutineButton({
  householdId,
  routineId,
  label,
  cadenceDays,
  nextDueOn,
  notes,
  memberId,
  privacyScope,
  labels,
}: {
  householdId: string;
  routineId: string;
  label: string;
  cadenceDays: number;
  nextDueOn: string;
  notes: string | null;
  memberId: string;
  privacyScope: "private" | "selected_family" | "household_operational";
  labels: HealthFormLabels;
}) {
  const words = labels.routine;
  const common = labels.common;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateRoutineAction, {});
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
          <input type="hidden" name="routineId" value={routineId} />
          <Select label={common.repeats} name="cadenceDays" defaultValue={String(cadenceDays)}>
            {CADENCES.map((cadence) => (
              <option key={cadence} value={cadence}>
                {words.cadence[cadence]}
              </option>
            ))}
          </Select>
          <Field label={common.nextDue} name="nextDueOn" type="date" defaultValue={nextDueOn} required />
          <TextareaField label={common.notes} name="notes" defaultValue={notes ?? ""} />
          <HealthPrivacyField labels={labels} defaultValue={privacyScope} subjectMemberId={memberId} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.saving : common.save}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Completing a routine — records the real reading it represents and advances the schedule, both in one step. */
function CompleteRoutineButton({
  householdId,
  routineId,
  vitalType,
  label,
  labels,
}: {
  householdId: string;
  routineId: string;
  vitalType: VitalType;
  label: string;
  labels: HealthFormLabels;
}) {
  const words = labels.routine;
  const common = labels.common;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(completeRoutineAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      setOpen(false);
      submitted.current = false;
    }
  }, [pending, state.error]);

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} aria-label={withName(words.markNamed, label)} title={common.markDone}>
        <CircleCheck aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={withName(words.recordTitle, words.lowercaseName ? label.toLowerCase() : label)}
        description={words.recordDescription}>
        <form
          action={(formData) => {
            submitted.current = true;
            formAction(formData);
          }}
          className="space-y-3"
        >
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="routineId" value={routineId} />
          {vitalType === "blood_pressure" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={common.systolic} name="value" type="number" step="any" required autoComplete="off" />
              <Field label={common.diastolic} name="secondaryValue" type="number" step="any" autoComplete="off" />
            </div>
          ) : (
            <Field label={common.value} name="value" type="number" step="any" required autoComplete="off" />
          )}
          <VitalUnitField vitalType={vitalType} labels={labels} />
          <TextareaField label={common.notes} name="notes" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.recording : common.record}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** A routine row's actions — mark done, edit, or remove (and bring back), so every routine can be added, updated and removed (CLAUDE.md rule 12). */
export function RoutineActions({
  householdId,
  routine,
  labels,
}: {
  householdId: string;
  routine: { id: string; vitalType: VitalType; customLabel: string | null; label: string; cadenceDays: number; nextDueOn: string; notes: string | null; status: "active" | "dismissed"; memberId: string; privacyScope: "private" | "selected_family" | "household_operational" };
  labels: HealthFormLabels;
}) {
  const common = labels.common;
  const [, dismissAction, dismissPending] = useActionState<ActionState, FormData>(dismissRoutineAction, {});
  const [, reactivateAction, reactivatePending] = useActionState<ActionState, FormData>(reactivateRoutineAction, {});

  const submit = (action: (formData: FormData) => void) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("routineId", routine.id);
    startTransition(() => action(formData));
  };

  if (routine.status === "dismissed") {
    return (
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label={common.bringBack} title={common.bringBack}>
        <RotateCcw aria-hidden className="size-3.5" />
      </Pill>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CompleteRoutineButton householdId={householdId} routineId={routine.id} vitalType={routine.vitalType} label={routine.label} labels={labels} />
      <EditRoutineButton
        householdId={householdId}
        routineId={routine.id}
        label={routine.label}
        cadenceDays={routine.cadenceDays}
        nextDueOn={routine.nextDueOn}
        notes={routine.notes}
        memberId={routine.memberId}
        privacyScope={routine.privacyScope}
        labels={labels}
      />
      <Pill type="button" tone="quiet" disabled={dismissPending} onClick={() => submit(dismissAction)} aria-label={common.remove} title={common.remove}>
        <Ban aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
