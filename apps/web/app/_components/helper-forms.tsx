"use client";

import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  createHelperEngagementAction,
  recordLeaveAction,
  removeHelperEngagementAction,
  setAvailabilityPatternAction,
  updateHelperEngagementAction,
} from "../(auth)/helper-actions";

const selectClass = "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";

type Person = { id: string; displayName: string };

/**
 * The Househelper sheets' words in the viewer's language, built on the server
 * by `helperFormLabels` (story 22-004). `{name}` stays a placeholder and is
 * filled in here with the helper's own name, which is never translated.
 * `dayNames` is Sunday-first: its index is the stored day of the week.
 */
export type HelperFormLabels = {
  recordLeave: string;
  leaveTitle: string;
  leaveDescription: string;
  who: string;
  date: string;
  whichWay: string;
  awayThatDay: string;
  extraDay: string;
  reason: string;
  reasonPlaceholder: string;
  recording: string;
  record: string;
  setDays: string;
  changeDays: string;
  daysTitle: string;
  daysDescription: string;
  days: string;
  dayNames: string[];
  from: string;
  to: string;
  saving: string;
  savePattern: string;
  kind: string;
  kindRegular: string;
  kindOccasional: string;
  kindService: string;
  since: string;
  notes: string;
  notesPlaceholder: string;
  addEngagement: string;
  newTitle: string;
  newDescription: string;
  adding: string;
  add: string;
  editEngagement: string;
  removeEngagement: string;
  editTitle: string;
  editDescription: string;
  saveChanges: string;
  removeTitle: string;
  removeDescription: string;
  remove: string;
  cancel: string;
};

const withName = (template: string, name: string) => template.replace("{name}", () => name);

/** "Record leave" as a form — the AI chat can prepare this, but it had nothing wired to carry it out. */
export function RecordLeaveButton({
  householdId,
  helpers,
  tone = "soft",
  labels,
}: {
  householdId: string;
  helpers: Person[];
  tone?: "primary" | "soft" | "quiet";
  labels: HelperFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordLeaveAction, {});

  return (
    <>
      <Pill type="button" tone={tone} onClick={() => setOpen(true)} className="gap-1.5">
        <CalendarDays aria-hidden className="size-3.5" /> {labels.recordLeave}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={labels.leaveTitle} description={labels.leaveDescription}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <div className="space-y-1.5">
            <label htmlFor="leave-member" className="block text-sm font-medium">{labels.who}</label>
            <select id="leave-member" name="memberId" className={selectClass}>
              {helpers.map((helper) => (
                <option key={helper.id} value={helper.id}>{helper.displayName}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.date} name="onDate" type="date" required />
            <div className="space-y-1.5">
              <label htmlFor="leave-kind" className="block text-sm font-medium">{labels.whichWay}</label>
              <select id="leave-kind" name="available" defaultValue="away" className={selectClass}>
                <option value="away">{labels.awayThatDay}</option>
                <option value="extra">{labels.extraDay}</option>
              </select>
            </div>
          </div>
          <Field label={labels.reason} name="reason" placeholder={labels.reasonPlaceholder} maxLength={200} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.recording : labels.record}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** The weekly pattern, set once for the whole week. */
export function WeeklyPatternButton({
  householdId,
  helper,
  current,
  labels,
}: {
  householdId: string;
  helper: Person;
  current: { dayOfWeek: number; startTime: string; endTime: string }[];
  labels: HelperFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setAvailabilityPatternAction, {});
  const days = new Set(current.map((window) => window.dayOfWeek));
  const first = current[0];

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="gap-1.5">
        {current.length === 0 ? <Plus aria-hidden className="size-3.5" /> : <Pencil aria-hidden className="size-3.5" />}
        {current.length === 0 ? labels.setDays : labels.changeDays}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={withName(labels.daysTitle, helper.displayName)} description={labels.daysDescription}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="memberId" value={helper.id} />
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{labels.days}</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {labels.dayNames.map((day, index) => (
                <label key={index} className="flex min-h-10 items-center gap-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 text-sm">
                  <input type="checkbox" name="days" value={index} defaultChecked={days.has(index)} className="size-4 accent-[var(--wh-primary)]" />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.from} name="startTime" type="time" required defaultValue={first?.startTime.slice(0, 5) ?? "08:00"} />
            <Field label={labels.to} name="endTime" type="time" required defaultValue={first?.endTime.slice(0, 5) ?? "13:00"} />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.saving : labels.savePattern}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

export type HelperEngagementInitial = {
  id: string;
  engagement: "regular" | "occasional" | "service";
  startedOn: string | null;
  notes: string | null;
};

function EngagementFields({
  current,
  labels,
}: {
  current?: HelperEngagementInitial;
  labels: HelperFormLabels;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="engagement" className="block text-sm font-medium">{labels.kind}</label>
        <select id="engagement" name="engagement" defaultValue={current?.engagement ?? "regular"} className={selectClass}>
          <option value="regular">{labels.kindRegular}</option>
          <option value="occasional">{labels.kindOccasional}</option>
          <option value="service">{labels.kindService}</option>
        </select>
      </div>
      <Field label={labels.since} name="startedOn" type="date" defaultValue={current?.startedOn ?? undefined} />
      <Field
        label={labels.notes}
        name="notes"
        placeholder={labels.notesPlaceholder}
        maxLength={500}
        defaultValue={current?.notes ?? undefined}
        autoComplete="off"
      />
    </>
  );
}

/**
 * A brand-new, distinct engagement for a helper who may already have one or
 * more — the same regular housekeeping helper taking on occasional cooking
 * on different days is a second arrangement, not an overwrite of the first
 * (CLAUDE.md principle 12: never stuck replacing what's already there).
 */
export function AddHelperEngagementButton({
  householdId,
  helper,
  labels,
}: {
  householdId: string;
  helper: Person;
  labels: HelperFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createHelperEngagementAction, {});

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {labels.addEngagement}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={withName(labels.newTitle, helper.displayName)} description={labels.newDescription}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="memberId" value={helper.id} />
          <EngagementFields labels={labels} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.adding : labels.add}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Editing or removing one already-recorded engagement — the update and remove half of "Add engagement". */
export function HelperEngagementRowControls({
  householdId,
  helper,
  current,
  labels,
}: {
  householdId: string;
  helper: Person;
  current: HelperEngagementInitial;
  labels: HelperFormLabels;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [editState, editAction, editPending] = useActionState<ActionState, FormData>(updateHelperEngagementAction, {});
  const [removeState, removeAction, removePending] = useActionState<ActionState, FormData>(removeHelperEngagementAction, {});

  return (
    <div className="flex items-center gap-1.5">
      <Pill
        type="button"
        tone="quiet"
        onClick={() => setEditOpen(true)}
        aria-label={labels.editEngagement}
        title={labels.editEngagement}
      >
        <Pencil aria-hidden className="size-3.5" />
      </Pill>
      <Pill
        type="button"
        tone="quiet"
        onClick={() => setRemoveOpen(true)}
        aria-label={labels.removeEngagement}
        title={labels.removeEngagement}
        className="text-[var(--wh-risk)]"
      >
        <Trash2 aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={editOpen} onOpenChange={setEditOpen} title={labels.editTitle} description={labels.editDescription}>
        <form action={editAction} className="space-y-3">
          {editState.error ? <Alert>{editState.error}</Alert> : null}
          <input type="hidden" name="id" value={current.id} />
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="memberId" value={helper.id} />
          <EngagementFields current={current} labels={labels} />
          <Button type="submit" disabled={editPending} className="w-full">
            {editPending ? labels.saving : labels.saveChanges}
          </Button>
        </form>
      </Sheet>

      <ConfirmationSheet
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={labels.removeTitle}
        description={withName(labels.removeDescription, helper.displayName)}
        confirmLabel={labels.remove}
        cancelLabel={labels.cancel}
        destructive
        pending={removePending}
        onConfirm={() => {
          const formData = new FormData();
          formData.set("id", current.id);
          formData.set("householdId", householdId);
          startTransition(() => removeAction(formData));
        }}
      >
        {removeState.error ? <p className="text-sm text-[var(--wh-risk)]">{removeState.error}</p> : null}
      </ConfirmationSheet>
    </div>
  );
}
