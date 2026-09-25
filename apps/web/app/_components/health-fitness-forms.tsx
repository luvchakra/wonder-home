"use client";

import { Ban, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import type { FitnessActivityType, FitnessFrequencyPeriod } from "@wonderhome/core/health/fitness";
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
import { withName, type HealthFormLabels } from "../_lib/health-form-labels";

/**
 * Stored values are offered in the domain's own order — the order the
 * server-built `labels` carries them in — and their words come from those
 * labels (story 22-004). The stored value itself never changes.
 */
const SCOPES = ["private", "selected_family", "household_operational"] as const;

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

/** Setting a consistency-oriented goal — never scored, never a leaderboard entry (story 21-008). */
export function AddFitnessGoalButton({
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
  const words = labels.goal;
  const common = labels.common;
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
        <Plus aria-hidden className="size-3.5" /> {words.add}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={words.title} description={words.description}>
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
          <Select label={common.activity} name="activityType" value={activityType} onChange={(event) => setActivityType(event.target.value as FitnessActivityType)}>
            {(Object.keys(labels.activityTypes) as FitnessActivityType[]).map((type) => (
              <option key={type} value={type}>
                {labels.activityTypes[type]}
              </option>
            ))}
          </Select>
          {activityType === "other" ? <Field label={common.whatCalled} name="customLabel" placeholder={labels.goal.customPlaceholder} required autoComplete="off" /> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label={words.howMany} name="targetCount" type="number" min={1} step={1} defaultValue={3} required autoComplete="off" />
            <Select label={words.per} name="frequencyPeriod" defaultValue="week">
              {(Object.keys(labels.periods) as FitnessFrequencyPeriod[]).map((period) => (
                <option key={period} value={period}>
                  {labels.periods[period]}
                </option>
              ))}
            </Select>
          </div>
          <Field label={common.preferredTime} name="preferredTime" type="time" />
          <Field label={common.notes} name="notes" placeholder={common.notesPlaceholder} autoComplete="off" />
          <Select label={common.whoCanSee} name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {labels.scopes[scope]}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.saving : words.submit}
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
  labels,
}: {
  householdId: string;
  goalId: string;
  label: string;
  targetCount: number;
  frequencyPeriod: FitnessFrequencyPeriod;
  notes: string | null;
  labels: HealthFormLabels;
}) {
  const words = labels.goal;
  const common = labels.common;
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
          <input type="hidden" name="goalId" value={goalId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={words.howMany} name="targetCount" type="number" min={1} step={1} defaultValue={targetCount} required autoComplete="off" />
            <Select label={words.per} name="frequencyPeriod" defaultValue={frequencyPeriod}>
              {(Object.keys(labels.periods) as FitnessFrequencyPeriod[]).map((period) => (
                <option key={period} value={period}>
                  {labels.periods[period]}
                </option>
              ))}
            </Select>
          </div>
          <Field label={common.notes} name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.saving : common.save}
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
  labels,
}: {
  householdId: string;
  goal: { id: string; label: string; targetCount: number; frequencyPeriod: FitnessFrequencyPeriod; notes: string | null; status: "active" | "dismissed" };
  labels: HealthFormLabels;
}) {
  const common = labels.common;
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
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label={common.bringBack} title={common.bringBack}>
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
        labels={labels}
      />
      <Pill type="button" tone="quiet" disabled={dismissPending} onClick={() => submit(dismissAction)} aria-label={common.remove} title={common.remove}>
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
  labels,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  goals: { id: string; label: string }[];
  labels: HealthFormLabels;
}) {
  const words = labels.session;
  const common = labels.common;
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
        <Plus aria-hidden className="size-3.5" /> {words.add}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={words.add} description={words.description}>
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
          <Select label={common.activity} name="activityType" value={activityType} onChange={(event) => setActivityType(event.target.value as FitnessActivityType)}>
            {(Object.keys(labels.activityTypes) as FitnessActivityType[]).map((type) => (
              <option key={type} value={type}>
                {labels.activityTypes[type]}
              </option>
            ))}
          </Select>
          {activityType === "other" ? <Field label={common.whatCalled} name="customLabel" placeholder={labels.goal.customPlaceholder} required autoComplete="off" /> : null}
          {goals.length > 0 ? (
            <Select label={words.countsToward} name="goalId" defaultValue="">
              <option value="">{words.noGoal}</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.label}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label={words.duration} name="durationMinutes" type="number" min={1} step={1} required autoComplete="off" />
            <Field label={words.distance} name="distanceValue" type="number" step="any" autoComplete="off" />
          </div>
          <Field label={words.distanceUnitRequired} name="distanceUnit" placeholder={words.distanceUnitPlaceholder} autoComplete="off" />
          <Field label={common.whenDefaultNow} name="startedAt" type="datetime-local" />
          <Field label={common.notes} name="notes" placeholder={common.notesPlaceholder} autoComplete="off" />
          <Select label={common.whoCanSee} name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {labels.scopes[scope]}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? words.logging : words.submit}
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
  labels,
}: {
  householdId: string;
  sessionId: string;
  label: string;
  durationMinutes: number;
  distanceValue: number | null;
  distanceUnit: string | null;
  notes: string | null;
  labels: HealthFormLabels;
}) {
  const words = labels.session;
  const common = labels.common;
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
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={withName(common.editNamed, label)} title={common.edit}>
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={words.editTitle} description={common.correctDescription}>
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
            <Field label={words.duration} name="durationMinutes" type="number" min={1} step={1} defaultValue={durationMinutes} required autoComplete="off" />
            <Field label={words.distance} name="distanceValue" type="number" step="any" defaultValue={distanceValue ?? ""} autoComplete="off" />
          </div>
          <Field label={words.distanceUnit} name="distanceUnit" defaultValue={distanceUnit ?? ""} autoComplete="off" />
          <Field label={common.notes} name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.saving : common.save}
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
  labels,
}: {
  householdId: string;
  session: { id: string; label: string; durationMinutes: number; distanceValue: number | null; distanceUnit: string | null; notes: string | null; status: "active" | "archived" };
  labels: HealthFormLabels;
}) {
  const common = labels.common;
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
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label={common.bringBack} title={common.bringBack}>
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
        labels={labels}
      />
      <Pill type="button" tone="quiet" disabled={archivePending} onClick={() => submit(archiveAction)} aria-label={common.remove} title={common.remove}>
        <Trash2 aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
