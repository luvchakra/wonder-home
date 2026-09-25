"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { createEventAction } from "../(auth)/family-actions";
import { EVENT_KINDS, type EventKind } from "../_lib/event-kinds";


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
};

export const NEW_EVENT_FORM_LABELS: NewEventFormLabels = {
  add: "Add event",
  title: "Add to the family calendar",
  description: "Protected time keeps everything else out of the way.",
  what: "What",
  whatPlaceholder: "Sunday lunch at Nani's",
  kind: "Kind",
  kinds: {
    family_time: "Family time",
    outing: "Outing",
    birthday: "Birthday",
    special_occasion: "Special occasion",
    visit: "Visit",
    travel: "Travel",
    appointment: "Appointment",
    other: "Something else",
  },
  starts: "Starts",
  ends: "Ends",
  where: "Where (optional)",
  wherePlaceholder: "Home",
  protect: "Protect this time",
  protectHint: "WonderHome will never schedule over it.",
  adding: "Adding…",
  submit: "Add to calendar",
};

/**
 * "Add event" as a sheet, so the calendar stays where it was.
 *
 * `label` exists because Home asks the same thing in its own words — its
 * family-moment card says "Plan something", and used to link to the Family
 * screen, which left a person on a page still hunting for the way to plan.
 * One form, asked for wherever the household is standing (rule 14: one path
 * per job, not a second button that navigates instead of doing).
 */
export function NewEventForm({
  householdId,
  kinds: kindsProp,
  label: labelProp,
  variant = "secondary",
  labels = NEW_EVENT_FORM_LABELS,
}: {
  householdId: string;
  kinds?: { value: string; label: string }[];
  label?: string;
  variant?: "primary" | "secondary";
  labels?: NewEventFormLabels;
}) {
  const kinds = kindsProp ?? EVENT_KINDS.map((value) => ({ value, label: labels.kinds[value] }));
  const label = labelProp ?? labels.add;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createEventAction, {});

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-4" /> {label}
      </Button>

      <Sheet open={open} onOpenChange={setOpen} title={labels.title} description={labels.description}>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field label={labels.what} name="title" required placeholder={labels.whatPlaceholder} autoComplete="off" />

          <div className="space-y-1.5">
            <label htmlFor="kind" className="block text-sm font-medium">{labels.kind}</label>
            <select
              id="kind"
              name="kind"
              defaultValue="family_time"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {kinds.map((kind) => (
                <option key={kind.value} value={kind.value}>{kind.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.starts} name="startsAt" type="datetime-local" required />
            <Field label={labels.ends} name="endsAt" type="datetime-local" required />
          </div>

          <Field label={labels.where} name="location" placeholder={labels.wherePlaceholder} autoComplete="off" />

          <label className="flex min-h-11 items-center gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-tone-people-soft)]/60 px-3 text-sm">
            <input type="checkbox" name="protected" className="size-4 accent-[var(--wh-primary)]" />
            <span>
              <span className="block font-medium">{labels.protect}</span>
              <span className="block text-xs text-[var(--wh-foreground-muted)]">{labels.protectHint}</span>
            </span>
          </label>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.adding : labels.submit}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
