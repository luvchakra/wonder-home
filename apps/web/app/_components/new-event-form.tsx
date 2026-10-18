"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";
import { Field } from "@wonderhome/core/ui/field";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { createEventAction, type EventActionState } from "../(auth)/family-actions";
import { EVENT_KINDS, type EventKind } from "../_lib/event-kinds";

/** The calendar fields' words (story 12-009). */
export type EventCalendarLabels = {
  allDay: string;
  date: string;
  endDate: string;
  who: string;
  whoHint: string;
  category: string;
  categoryFromKind: string;
  categories: { value: string; label: string }[];
  more: string;
  repeat: string;
  repeats: { value: string; label: string }[];
  repeatUntil: string;
  visibility: string;
  visibilities: { value: string; label: string }[];
  visibilityHint: string;
  notes: string;
  clash: string;
  anyway: string;
};

/** The sheet's words; a page that knows the viewer's language passes its catalog's wording (story 22-004). */
export type NewEventFormLabels = {
  add: string;
  title: string;
  description: string;
  what: string;
  whatPlaceholder: string;
  kind: string;
  kinds: Record<EventKind, string>;
  starts: string;
  ends: string;
  where: string;
  wherePlaceholder: string;
  protect: string;
  protectHint: string;
  adding: string;
  submit: string;
  calendar: EventCalendarLabels;
};

/**
 * "Add event" as a sheet, so the calendar stays where it was.
 *
 * `label` exists because Home asks the same thing in its own words — its
 * family-moment card says "Plan something", and used to link to the Family
 * screen, which left a person on a page still hunting for the way to plan.
 * One form, asked for wherever the household is standing (rule 14: one path
 * per job, not a second button that navigates instead of doing).
 *
 * The Family Calendar (story 12-009) uses the same form: all day, who is
 * going, a category, and under "More options" repeat, who can see it and
 * notes. Before anything is written the server checks for clashes and says
 * them in words; "Add anyway" adds it regardless.
 */
export function NewEventForm({
  householdId,
  kinds: kindsProp,
  label: labelProp,
  variant = "secondary",
  labels,
  members = [],
  defaultDate,
}: {
  householdId: string;
  kinds?: { value: string; label: string }[];
  label?: string;
  variant?: "primary" | "secondary";
  labels: NewEventFormLabels;
  /** Who can be asked; without them the form has no "Who's going". */
  members?: { value: string; label: string }[];
  /** The day the sheet starts on, as YYYY-MM-DD. */
  defaultDate?: string;
}) {
  const kinds = kindsProp ?? EVENT_KINDS.map((value) => ({ value, label: labels.kinds[value] }));
  const label = labelProp ?? labels.add;
  const words = labels.calendar;
  const [open, setOpen] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [state, formAction, pending] = useActionState<EventActionState, FormData>(createEventAction, {});
  // A save that came back without an error or a clash closes the sheet; anything else keeps it open.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error && !state.clashes?.length) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  // A clash answers the details as they were sent; editing after it asks again.
  const [editedAfter, setEditedAfter] = useState<EventActionState | null>(null);
  const clashes = editedAfter === state ? [] : (state.clashes ?? []);

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-4" /> {label}
      </Button>

      <Sheet open={open} onOpenChange={setOpen} title={labels.title} description={labels.description}>
        <form action={formAction} onChange={() => setEditedAfter(state)} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {clashes.length > 0 ? (
            <Alert>
              <span className="block font-medium">{words.clash}</span>
              <ul className="mt-1 list-disc ps-5">
                {clashes.map((clash) => (
                  <li key={clash}>{clash}</li>
                ))}
              </ul>
              <input type="hidden" name="confirmClash" value="on" />
            </Alert>
          ) : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field label={labels.what} name="title" required placeholder={labels.whatPlaceholder} autoComplete="off" />

          <Select label={labels.kind} name="kind" defaultValue="family_time">
            {kinds.map((kind) => (
              <option key={kind.value} value={kind.value}>{kind.label}</option>
            ))}
          </Select>

          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" name="allDay" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} className="size-4 accent-[var(--wh-primary)]" />
            {words.allDay}
          </label>

          {allDay ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={words.date} name="startDate" type="date" required defaultValue={defaultDate} />
              <Field label={words.endDate} name="endDate" type="date" defaultValue={defaultDate} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={labels.starts} name="startsAt" type="datetime-local" required defaultValue={defaultDate ? `${defaultDate}T18:00` : undefined} />
              <Field label={labels.ends} name="endsAt" type="datetime-local" required defaultValue={defaultDate ? `${defaultDate}T19:00` : undefined} />
            </div>
          )}

          {members.length > 0 ? (
            <div className="space-y-1">
              <ChoiceChips legend={words.who} name="memberIds" type="checkbox" options={members} />
              <p className="text-xs text-[var(--wh-foreground-muted)]">{words.whoHint}</p>
            </div>
          ) : null}

          <Select label={words.category} name="category" defaultValue="">
            <option value="">{words.categoryFromKind}</option>
            {words.categories.map((category) => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </Select>

          <Field label={labels.where} name="location" placeholder={labels.wherePlaceholder} autoComplete="off" />

          <details className="group space-y-4 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] px-3 py-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{words.more}</summary>
            <div className="space-y-4 pb-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select label={words.repeat} name="repeat" defaultValue="none">
                  {words.repeats.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
                <Field label={words.repeatUntil} name="repeatUntil" type="date" />
              </div>
              <div className="space-y-1">
                <ChoiceChips legend={words.visibility} name="visibility" options={words.visibilities} defaultValue="household" />
                <p className="text-xs text-[var(--wh-foreground-muted)]">{words.visibilityHint}</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-event-notes" className="block text-sm font-medium">{words.notes}</label>
                <textarea
                  id="new-event-notes"
                  name="notes"
                  maxLength={1000}
                  rows={3}
                  className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
                />
              </div>
            </div>
          </details>

          <label className="flex min-h-11 items-center gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-tone-people-soft)]/60 px-3 text-sm">
            <input type="checkbox" name="protected" className="size-4 accent-[var(--wh-primary)]" />
            <span>
              <span className="block font-medium">{labels.protect}</span>
              <span className="block text-xs text-[var(--wh-foreground-muted)]">{labels.protectHint}</span>
            </span>
          </label>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.adding : clashes.length > 0 ? words.anyway : labels.submit}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
