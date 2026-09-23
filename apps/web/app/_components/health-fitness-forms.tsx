"use client";

import { Ban, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { FITNESS_ACTIVITY_LABEL, type FitnessActivityType, type FitnessFrequencyPeriod } from "@wonderhome/core/health/fitness";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  archiveFitnessSessionAction,
  createFitnessGoalAction,
  createFitnessSessionAction,
  dismissFitnessGoalAction,
  reactivateFitnessGoalAction,
  reactivateFitnessSessionAction,
  updateFitnessGoalAction,
  updateFitnessSessionAction,
} from "../(auth)/health-fitness-actions";

const ACTIVITY_OPTIONS: { value: FitnessActivityType; label: string }[] = (Object.keys(FITNESS_ACTIVITY_LABEL) as FitnessActivityType[]).map((value) => ({
  value,
  label: FITNESS_ACTIVITY_LABEL[value],
}));

const FREQUENCY_OPTIONS: { value: FitnessFrequencyPeriod; label: string }[] = [
  { value: "day", label: "day" },
  { value: "week", label: "week" },
  { value: "month", label: "month" },
];

const SCOPE_OPTIONS = [
  { value: "private", label: "Only me" },
  { value: "selected_family", label: "People I choose" },
  { value: "household_operational", label: "The whole household" },
] as const;

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

/** Setting a consistency-oriented goal — never scored, never a leaderboard entry (story 21-008). */
export function AddFitnessGoalButton({
  householdId,
  members,
  defaultPrivacyScope,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
}) {
  const [open, setOpen] = useState(false);
  const [activityType, setActivityType] = useState<FitnessActivityType>("walk");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createFitnessGoalAction, {});
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
        <Plus aria-hidden className="size-3.5" /> Set a goal
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Set a fitness goal" description="How often you'd like to keep it up — never scored, just yours to see.">
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
          <Select label="Activity" name="activityType" value={activityType} onChange={(event) => setActivityType(event.target.value as FitnessActivityType)}>
            {ACTIVITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {activityType === "other" ? <Field label="What is it called" name="customLabel" placeholder="Pilates" required autoComplete="off" /> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="How many times" name="targetCount" type="number" min={1} step={1} defaultValue={3} required autoComplete="off" />
            <Select label="Per" name="frequencyPeriod" defaultValue="week">
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <Field label="Preferred time (optional)" name="preferredTime" type="time" />
          <Field label="Notes (optional)" name="notes" placeholder="Anything worth remembering" autoComplete="off" />
          <Select label="Who can see this" name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Set goal"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

function EditFitnessGoalButton({
  householdId,
  goalId,
  label,
  targetCount,
  frequencyPeriod,
  notes,
}: {
  householdId: string;
  goalId: string;
  label: string;
  targetCount: number;
  frequencyPeriod: FitnessFrequencyPeriod;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateFitnessGoalAction, {});
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

      <Sheet open={open} onOpenChange={setOpen} title="Edit goal" description="Change how often you'd like to keep this up.">
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
          <input type="hidden" name="goalId" value={goalId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="How many times" name="targetCount" type="number" min={1} step={1} defaultValue={targetCount} required autoComplete="off" />
            <Select label="Per" name="frequencyPeriod" defaultValue={frequencyPeriod}>
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <Field label="Notes (optional)" name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** A goal row's actions — edit, or remove and bring back (CLAUDE.md rule 12). */
export function GoalActions({
  householdId,
  goal,
}: {
  householdId: string;
  goal: { id: string; label: string; targetCount: number; frequencyPeriod: FitnessFrequencyPeriod; notes: string | null; status: "active" | "dismissed" };
}) {
  const [, dismissAction, dismissPending] = useActionState<ActionState, FormData>(dismissFitnessGoalAction, {});
  const [, reactivateAction, reactivatePending] = useActionState<ActionState, FormData>(reactivateFitnessGoalAction, {});

  const submit = (action: (formData: FormData) => void) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("goalId", goal.id);
    startTransition(() => action(formData));
  };

  if (goal.status === "dismissed") {
    return (
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label="Bring back" title="Bring back">
        <RotateCcw aria-hidden className="size-3.5" />
      </Pill>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <EditFitnessGoalButton
        householdId={householdId}
        goalId={goal.id}
        label={goal.label}
        targetCount={goal.targetCount}
        frequencyPeriod={goal.frequencyPeriod}
        notes={goal.notes}
      />
      <Pill type="button" tone="quiet" disabled={dismissPending} onClick={() => submit(dismissAction)} aria-label="Remove" title="Remove">
        <Ban aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Logging a single activity — always what actually happened (story 21-008). */
export function LogFitnessSessionButton({
  householdId,
  members,
  defaultPrivacyScope,
  goals,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  goals: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [activityType, setActivityType] = useState<FitnessActivityType>("walk");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createFitnessSessionAction, {});
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
        <Plus aria-hidden className="size-3.5" /> Log a session
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Log a session" description="What you actually did.">
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
          <Select label="Activity" name="activityType" value={activityType} onChange={(event) => setActivityType(event.target.value as FitnessActivityType)}>
            {ACTIVITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {activityType === "other" ? <Field label="What is it called" name="customLabel" placeholder="Pilates" required autoComplete="off" /> : null}
          {goals.length > 0 ? (
            <Select label="Counts toward (optional)" name="goalId" defaultValue="">
              <option value="">Not tied to a goal</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.label}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (minutes)" name="durationMinutes" type="number" min={1} step={1} required autoComplete="off" />
            <Field label="Distance (optional)" name="distanceValue" type="number" step="any" autoComplete="off" />
          </div>
          <Field label="Distance unit (required if a distance was given)" name="distanceUnit" placeholder="km, mi…" autoComplete="off" />
          <Field label="When (optional — defaults to now)" name="startedAt" type="datetime-local" />
          <Field label="Notes (optional)" name="notes" placeholder="Anything worth remembering" autoComplete="off" />
          <Select label="Who can see this" name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Logging…" : "Log session"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

function EditFitnessSessionButton({
  householdId,
  sessionId,
  label,
  durationMinutes,
  distanceValue,
  distanceUnit,
  notes,
}: {
  householdId: string;
  sessionId: string;
  label: string;
  durationMinutes: number;
  distanceValue: number | null;
  distanceUnit: string | null;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateFitnessSessionAction, {});
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

      <Sheet open={open} onOpenChange={setOpen} title="Edit session" description="Correct what this says.">
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
          <input type="hidden" name="sessionId" value={sessionId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (minutes)" name="durationMinutes" type="number" min={1} step={1} defaultValue={durationMinutes} required autoComplete="off" />
            <Field label="Distance (optional)" name="distanceValue" type="number" step="any" defaultValue={distanceValue ?? ""} autoComplete="off" />
          </div>
          <Field label="Distance unit" name="distanceUnit" defaultValue={distanceUnit ?? ""} autoComplete="off" />
          <Field label="Notes (optional)" name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** A session row's actions — edit, or remove and bring back (CLAUDE.md rule 12). */
export function SessionActions({
  householdId,
  session,
}: {
  householdId: string;
  session: { id: string; label: string; durationMinutes: number; distanceValue: number | null; distanceUnit: string | null; notes: string | null; status: "active" | "archived" };
}) {
  const [, archiveAction, archivePending] = useActionState<ActionState, FormData>(archiveFitnessSessionAction, {});
  const [, reactivateAction, reactivatePending] = useActionState<ActionState, FormData>(reactivateFitnessSessionAction, {});

  const submit = (action: (formData: FormData) => void) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("sessionId", session.id);
    startTransition(() => action(formData));
  };

  if (session.status === "archived") {
    return (
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label="Bring back" title="Bring back">
        <RotateCcw aria-hidden className="size-3.5" />
      </Pill>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <EditFitnessSessionButton
        householdId={householdId}
        sessionId={session.id}
        label={session.label}
        durationMinutes={session.durationMinutes}
        distanceValue={session.distanceValue}
        distanceUnit={session.distanceUnit}
        notes={session.notes}
      />
      <Pill type="button" tone="quiet" disabled={archivePending} onClick={() => submit(archiveAction)} aria-label="Remove" title="Remove">
        <Trash2 aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
