"use client";

import { Ban, CircleCheck, Pencil, Plus, RotateCcw } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { VITAL_TYPE_LABEL } from "@wonderhome/core/health/agenda";
import type { VitalType } from "@wonderhome/core/health/vitals";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
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

const TYPE_OPTIONS: { value: VitalType; label: string }[] = (Object.keys(VITAL_TYPE_LABEL) as VitalType[]).map((value) => ({ value, label: VITAL_TYPE_LABEL[value] }));

const CADENCE_OPTIONS = [
  { value: "1", label: "Every day" },
  { value: "7", label: "Every week" },
  { value: "14", label: "Every 2 weeks" },
  { value: "30", label: "Every month" },
] as const;

const SCOPE_OPTIONS = [
  { value: "private", label: "Only me" },
  { value: "selected_family", label: "People I choose" },
  { value: "household_operational", label: "The whole household" },
] as const;

/** Configuring a recurring measurement — the household's own commitment, never one WonderHome invents (story 21-007). */
export function AddRoutineButton({
  householdId,
  members,
  defaultPrivacyScope,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
}) {
  const [open, setOpen] = useState(false);
  const [vitalType, setVitalType] = useState<VitalType>("blood_pressure");
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
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Set up a routine
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Set up a measurement routine" description="A recurring commitment your household set, not one WonderHome invents.">
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
          <Select label="Measurement" name="vitalType" value={vitalType} onChange={(event) => setVitalType(event.target.value as VitalType)}>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {vitalType === "custom" ? <Field label="What is it called" name="customLabel" placeholder="Blood sugar" required autoComplete="off" /> : null}
          <Select label="Repeats" name="cadenceDays" defaultValue="7">
            {CADENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Field label="Preferred time (optional)" name="preferredTime" type="time" />
          <Field label="First due" name="nextDueOn" type="date" required />
          <input type="hidden" name="reminderEnabled" value={reminderEnabled ? "true" : "false"} />
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm font-medium">Remind us when it&apos;s due</span>
            <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} label="Remind us when it's due" />
          </div>
          <Field label="Notes (optional)" name="notes" placeholder="Anything worth remembering" autoComplete="off" />
          <Select label="Who can see this" name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add routine"}
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
}: {
  householdId: string;
  routineId: string;
  label: string;
  cadenceDays: number;
  nextDueOn: string;
  notes: string | null;
}) {
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
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={`Edit ${label}`} title="Edit">
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Edit routine" description="Update how often this repeats, or move its next due date.">
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
          <Select label="Repeats" name="cadenceDays" defaultValue={String(cadenceDays)}>
            {CADENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
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

/** Completing a routine — records the real reading it represents and advances the schedule, both in one step. */
function CompleteRoutineButton({ householdId, routineId, vitalType, label }: { householdId: string; routineId: string; vitalType: VitalType; label: string }) {
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
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} aria-label={`Mark ${label} done`} title="Mark done">
        <CircleCheck aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={`Record ${label.toLowerCase()}`} description="This records the reading and moves the routine to its next due date.">
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
              <Field label="Systolic" name="value" type="number" step="any" required autoComplete="off" />
              <Field label="Diastolic" name="secondaryValue" type="number" step="any" autoComplete="off" />
            </div>
          ) : (
            <Field label="Value" name="value" type="number" step="any" required autoComplete="off" />
          )}
          <Field label="Unit" name="unit" placeholder={vitalType === "blood_pressure" ? "mmHg" : "kg, lb, bpm…"} required autoComplete="off" />
          <Field label="Notes (optional)" name="notes" autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Recording…" : "Record"}
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
}: {
  householdId: string;
  routine: { id: string; vitalType: VitalType; customLabel: string | null; label: string; cadenceDays: number; nextDueOn: string; notes: string | null; status: "active" | "dismissed" };
}) {
  const [, dismissAction, dismissPending] = useActionState<ActionState, FormData>(dismissRoutineAction, {});
  const [, reactivateAction, reactivatePending] = useActionState<ActionState, FormData>(reactivateRoutineAction, {});

  const submit = (action: (formData: FormData) => void) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("routineId", routine.id);
    action(formData);
  };

  if (routine.status === "dismissed") {
    return (
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label="Bring back" title="Bring back">
        <RotateCcw aria-hidden className="size-3.5" />
      </Pill>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CompleteRoutineButton householdId={householdId} routineId={routine.id} vitalType={routine.vitalType} label={routine.label} />
      <EditRoutineButton householdId={householdId} routineId={routine.id} label={routine.label} cadenceDays={routine.cadenceDays} nextDueOn={routine.nextDueOn} notes={routine.notes} />
      <Pill type="button" tone="quiet" disabled={dismissPending} onClick={() => submit(dismissAction)} aria-label="Remove" title="Remove">
        <Ban aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
