"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { createEventAction } from "../(auth)/family-actions";

const KINDS = [
  { value: "family_time", label: "Family time" },
  { value: "outing", label: "Outing" },
  { value: "birthday", label: "Birthday" },
  { value: "visit", label: "Visit" },
  { value: "travel", label: "Travel" },
  { value: "appointment", label: "Appointment" },
  { value: "other", label: "Something else" },
];

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
  kinds = KINDS,
  label = "Add event",
  variant = "secondary",
}: {
  householdId: string;
  kinds?: { value: string; label: string }[];
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createEventAction, {});

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-4" /> {label}
      </Button>

      <Sheet open={open} onOpenChange={setOpen} title="Add to the family calendar" description="Protected time keeps everything else out of the way.">
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field label="What" name="title" required placeholder="Sunday lunch at Nani's" autoComplete="off" />

          <div className="space-y-1.5">
            <label htmlFor="kind" className="block text-sm font-medium">Kind</label>
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
            <Field label="Starts" name="startsAt" type="datetime-local" required />
            <Field label="Ends" name="endsAt" type="datetime-local" required />
          </div>

          <Field label="Where (optional)" name="location" placeholder="Home" autoComplete="off" />

          <label className="flex min-h-11 items-center gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-tone-people-soft)]/60 px-3 text-sm">
            <input type="checkbox" name="protected" className="size-4 accent-[var(--wh-primary)]" />
            <span>
              <span className="block font-medium">Protect this time</span>
              <span className="block text-xs text-[var(--wh-foreground-muted)]">WonderHome will never schedule over it.</span>
            </span>
          </label>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add to calendar"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
