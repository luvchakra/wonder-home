"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { addBeliefAction, reviewCertificationAction } from "../(auth)/certification-actions";

const CATEGORIES = [
  { value: "family_roles", label: "Family & roles" },
  { value: "home_routines", label: "Home routines" },
  { value: "education", label: "Education" },
  { value: "finance", label: "Finance" },
  { value: "lifestyle", label: "Lifestyle preferences" },
  { value: "safety", label: "Safety" },
];

/**
 * "Tell WonderHome something" as a sheet — the manual half of Certification's
 * only entry point, which used to be the AI chat alone (rules 2 and 3).
 */
export function AddBeliefButton({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(addBeliefAction, {});

  return (
    <>
      <Pill type="button" tone="primary" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Tell WonderHome something
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Tell WonderHome something" description="A fact, a preference, a rule for the house — say it plainly and it's confirmed straight away, since your household is the one saying so.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <div className="space-y-1.5">
            <label htmlFor="claim" className="block text-sm font-medium">What’s true?</label>
            <textarea
              id="claim"
              name="claim"
              required
              minLength={1}
              maxLength={300}
              rows={3}
              placeholder="We prefer dinner at 8. Grandma is allergic to peanuts. Rekha has Sundays off."
              className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="category" className="block text-sm font-medium">Category</label>
            <select
              id="category"
              name="category"
              defaultValue="home_routines"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <AddBeliefSubmit />
        </form>
      </Sheet>
    </>
  );
}

function AddBeliefSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Adding…" : "Add"}
    </Button>
  );
}

type Decision = "confirmed" | "removed" | "deferred";

const LABEL: Record<Decision, string> = { confirmed: "Confirm", removed: "Remove", deferred: "Later" };
const TONE: Record<Decision, "primary" | "quiet"> = { confirmed: "primary", removed: "quiet", deferred: "quiet" };

function ReviewPill({ decision }: { decision: Decision }) {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone={TONE[decision]} disabled={pending}>
      {pending ? "…" : LABEL[decision]}
    </Pill>
  );
}

function CorrectPill() {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone="soft" disabled={pending}>
      {pending ? "…" : "Correct"}
    </Pill>
  );
}

/**
 * Confirm/Remove/Later/Correct, with a real result: a pending state on the
 * button that was actually clicked, and an error the reviewer can read
 * instead of an item that quietly stays put with no explanation.
 */
export function CertificationControls({ householdId, itemId }: { householdId: string; itemId: string }) {
  const [state, formAction] = useActionState(reviewCertificationAction, {});

  return (
    <div className="flex w-full flex-col gap-1.5">
      {state.error ? <Alert className="py-1 text-xs">{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info" className="py-1 text-xs">{state.notice}</Alert> : null}
      <div className="flex flex-wrap gap-1.5">
        {(["confirmed", "removed", "deferred"] as const).map((decision) => (
          <form key={decision} action={formAction}>
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="decision" value={decision} />
            <ReviewPill decision={decision} />
          </form>
        ))}
      </div>
      <form action={formAction} className="flex w-full gap-1.5 pt-1">
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="decision" value="corrected" />
        <label htmlFor={`correct-${itemId}`} className="sr-only">Correction</label>
        <input
          id={`correct-${itemId}`}
          name="correction"
          placeholder="Correct it: what’s actually true?"
          required
          minLength={1}
          maxLength={300}
          className="min-h-9 min-w-0 flex-1 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-xs"
        />
        <CorrectPill />
      </form>
    </div>
  );
}
