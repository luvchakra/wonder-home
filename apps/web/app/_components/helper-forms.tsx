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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const selectClass = "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";

type Person = { id: string; displayName: string };

/** "Record leave" as a form — the AI chat can prepare this, but it had nothing wired to carry it out. */
export function RecordLeaveButton({ householdId, helpers, tone = "soft" }: { householdId: string; helpers: Person[]; tone?: "primary" | "soft" | "quiet" }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordLeaveAction, {});

  return (
    <>
      <Pill type="button" tone={tone} onClick={() => setOpen(true)} className="gap-1.5">
        <CalendarDays aria-hidden className="size-3.5" /> Record leave
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="A day that’s different" description="A day off, or an extra day. WonderHome re-checks what they normally handle that day.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <div className="space-y-1.5">
            <label htmlFor="leave-member" className="block text-sm font-medium">Who</label>
            <select id="leave-member" name="memberId" className={selectClass}>
              {helpers.map((helper) => (
                <option key={helper.id} value={helper.id}>{helper.displayName}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" name="onDate" type="date" required />
            <div className="space-y-1.5">
              <label htmlFor="leave-kind" className="block text-sm font-medium">Which way</label>
              <select id="leave-kind" name="available" defaultValue="away" className={selectClass}>
                <option value="away">Away that day</option>
                <option value="extra">Extra day</option>
              </select>
            </div>
          </div>
          <Field label="Reason (optional)" name="reason" placeholder="Festival at home" maxLength={200} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Recording…" : "Record"}
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
}: {
  householdId: string;
  helper: Person;
  current: { dayOfWeek: number; startTime: string; endTime: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setAvailabilityPatternAction, {});
  const days = new Set(current.map((window) => window.dayOfWeek));
  const first = current[0];

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="gap-1.5">
        {current.length === 0 ? <Plus aria-hidden className="size-3.5" /> : <Pencil aria-hidden className="size-3.5" />}
        {current.length === 0 ? "Set usual days" : "Change usual days"}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={`${helper.displayName}’s usual days`} description="When they are normally here. A single absence goes under leave, never here.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="memberId" value={helper.id} />
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Days</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {DAYS.map((day, index) => (
                <label key={day} className="flex min-h-10 items-center gap-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 text-sm">
                  <input type="checkbox" name="days" value={index} defaultChecked={days.has(index)} className="size-4 accent-[var(--wh-primary)]" />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" name="startTime" type="time" required defaultValue={first?.startTime.slice(0, 5) ?? "08:00"} />
            <Field label="To" name="endTime" type="time" required defaultValue={first?.endTime.slice(0, 5) ?? "13:00"} />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save pattern"}
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
}: {
  current?: HelperEngagementInitial;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="engagement" className="block text-sm font-medium">Kind of help</label>
        <select id="engagement" name="engagement" defaultValue={current?.engagement ?? "regular"} className={selectClass}>
          <option value="regular">Regular — most days</option>
          <option value="occasional">Occasional</option>
          <option value="service">A service that visits</option>
        </select>
      </div>
      <Field label="With you since (optional)" name="startedOn" type="date" defaultValue={current?.startedOn ?? undefined} />
      <Field
        label="Notes (optional)"
        name="notes"
        placeholder="Prefers mornings; speaks Bengali and Hindi."
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
}: {
  householdId: string;
  helper: Person;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createHelperEngagementAction, {});

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Add engagement
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={`A new arrangement for ${helper.displayName}`} description="A second, distinct engagement — its own kind of help, start date and notes. WonderHome keeps no record of how anyone performs.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="memberId" value={helper.id} />
          <EngagementFields />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add"}
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
}: {
  householdId: string;
  helper: Person;
  current: HelperEngagementInitial;
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
        aria-label={`Edit this engagement`}
        title="Edit this engagement"
      >
        <Pencil aria-hidden className="size-3.5" />
      </Pill>
      <Pill
        type="button"
        tone="quiet"
        onClick={() => setRemoveOpen(true)}
        aria-label="Remove this engagement"
        title="Remove this engagement"
        className="text-[var(--wh-risk)]"
      >
        <Trash2 aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={editOpen} onOpenChange={setEditOpen} title={`Edit this arrangement`} description="Change what the household knows about this engagement.">
        <form action={editAction} className="space-y-3">
          {editState.error ? <Alert>{editState.error}</Alert> : null}
          <input type="hidden" name="id" value={current.id} />
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="memberId" value={helper.id} />
          <EngagementFields current={current} />
          <Button type="submit" disabled={editPending} className="w-full">
            {editPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </Sheet>

      <ConfirmationSheet
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove this engagement?"
        description={`This one arrangement with ${helper.displayName} goes away. Any other engagement they have is untouched.`}
        confirmLabel="Remove"
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
