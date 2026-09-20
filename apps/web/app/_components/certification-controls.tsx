"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Pill } from "@wonderhome/core/ui/pill";

import { reviewCertificationAction } from "../(auth)/certification-actions";

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
