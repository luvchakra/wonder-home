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

const CATEGORIES = ["family_roles", "home_routines", "education", "finance", "lifestyle", "safety"] as const;

/**
 * HomeBrain Review's controls in the viewer's language, built on the server
 * by `certificationControlLabels` (story 22-004). The stored category and
 * decision values never change; only their words do.
 */
export type CertificationControlLabels = {
  add: string;
  addLede: string;
  claim: string;
  claimPlaceholder: string;
  category: string;
  categories: Record<(typeof CATEGORIES)[number], string>;
  adding: string;
  submit: string;
  decisions: Record<Decision, string>;
  correct: string;
  correction: string;
  correctionPlaceholder: string;
};

/**
 * "Tell WonderHome something" as a sheet — the manual half of Certification's
 * only entry point, which used to be the AI chat alone (rules 2 and 3).
 */
export function AddBeliefButton({ householdId, labels }: { householdId: string; labels: CertificationControlLabels }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(addBeliefAction, {});

  return (
    <>
      <Pill type="button" tone="primary" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {labels.add}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={labels.add} description={labels.addLede}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <div className="space-y-1.5">
            <label htmlFor="claim" className="block text-sm font-medium">{labels.claim}</label>
            <textarea
              id="claim"
              name="claim"
              required
              minLength={1}
              maxLength={300}
              rows={3}
              placeholder={labels.claimPlaceholder}
              className="block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="category" className="block text-sm font-medium">{labels.category}</label>
            <select
              id="category"
              name="category"
              defaultValue="home_routines"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{labels.categories[c]}</option>
              ))}
            </select>
          </div>
          <AddBeliefSubmit labels={labels} />
        </form>
      </Sheet>
    </>
  );
}

function AddBeliefSubmit({ labels }: { labels: CertificationControlLabels }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? labels.adding : labels.submit}
    </Button>
  );
}

type Decision = "confirmed" | "removed" | "deferred";

const TONE: Record<Decision, "primary" | "quiet"> = { confirmed: "primary", removed: "quiet", deferred: "quiet" };

function ReviewPill({ decision, label }: { decision: Decision; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone={TONE[decision]} disabled={pending}>
      {pending ? "…" : label}
    </Pill>
  );
}

function CorrectPill({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone="soft" disabled={pending}>
      {pending ? "…" : label}
    </Pill>
  );
}

/**
 * Confirm/Remove/Later/Correct, with a real result: a pending state on the
 * button that was actually clicked, and an error the reviewer can read
 * instead of an item that quietly stays put with no explanation.
 */
export function CertificationControls({ householdId, itemId, labels }: { householdId: string; itemId: string; labels: CertificationControlLabels }) {
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
            <ReviewPill decision={decision} label={labels.decisions[decision]} />
          </form>
        ))}
      </div>
      <form action={formAction} className="flex w-full gap-1.5 pt-1">
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="decision" value="corrected" />
        <label htmlFor={`correct-${itemId}`} className="sr-only">{labels.correction}</label>
        <input
          id={`correct-${itemId}`}
          name="correction"
          placeholder={labels.correctionPlaceholder}
          required
          minLength={1}
          maxLength={300}
          className="min-h-9 min-w-0 flex-1 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-xs"
        />
        <CorrectPill label={labels.correct} />
      </form>
    </div>
  );
}
