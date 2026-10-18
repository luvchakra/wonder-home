"use client";

import { CheckSquare, Plus } from "lucide-react";
import { startTransition, useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { addBeliefAction, reviewCertificationAction, reviewManyAction } from "../(auth)/certification-actions";

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

export type BulkReviewLabels = {
  select: string;
  done: string;
  /** "{count} selected". */
  selected: string;
  all: string;
  clear: string;
  /** Accessible name of one row's checkbox: "Select: {claim}". */
  pick: string;
  decisions: Record<Decision, string>;
  removeTitle: string;
  removeLede: string;
  cancel: string;
  working: string;
};

/**
 * The review list with a way to decide many at once: "Select" puts a box on
 * every row, and the bar above the list then confirms, removes or leaves for
 * later everything ticked — through the same review path each row's own
 * buttons use, one decision per item on the record. Removing asks first,
 * naming how many. A correction stays one item at a time, since it is that
 * item's own words.
 */
export function BulkReviewList({
  householdId,
  rows,
  labels,
  selectable = true,
}: {
  householdId: string;
  rows: { id: string; claim: string; meta: string; node: ReactNode }[];
  labels: BulkReviewLabels;
  /** Only someone who may review (an adult) gets the boxes at all. */
  selectable?: boolean;
}) {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reviewManyAction, {});
  const ids = rows.map((row) => row.id);
  // Rows that were decided leave the list; a stale pick never lingers.
  const chosen = ids.filter((id) => picked.has(id));

  const submit = (decision: Decision) => {
    const data = new FormData();
    data.set("householdId", householdId);
    data.set("decision", decision);
    for (const id of chosen) data.append("itemIds", id);
    startTransition(() => formAction(data));
    setPicked(new Set());
  };

  return (
    <div className="space-y-2">
      {selectable && rows.length > 1 ? (
      <div className="flex flex-wrap items-center gap-2 px-2 pt-1">
        <Pill type="button" tone={selecting ? "primary" : "soft"} aria-pressed={selecting} onClick={() => { setSelecting((on) => !on); setPicked(new Set()); }}>
          <CheckSquare aria-hidden className="size-3.5" /> {selecting ? labels.done : labels.select}
        </Pill>
        {selecting ? (
          <>
            <span className="text-sm text-[var(--wh-foreground-muted)]" aria-live="polite">{labels.selected.replace("{count}", String(chosen.length))}</span>
            <Pill type="button" tone="quiet" onClick={() => setPicked(chosen.length === ids.length ? new Set() : new Set(ids))}>
              {chosen.length === ids.length ? labels.clear : labels.all}
            </Pill>
          </>
        ) : null}
      </div>
      ) : null}
      {selecting ? (
        <div className="flex flex-wrap gap-2 px-2">
          <Pill type="button" tone="primary" disabled={pending || chosen.length === 0} onClick={() => submit("confirmed")}>
            {labels.decisions.confirmed}
          </Pill>
          <Pill type="button" tone="quiet" disabled={pending || chosen.length === 0} onClick={() => setConfirmRemove(true)}>
            {labels.decisions.removed}
          </Pill>
          <Pill type="button" tone="quiet" disabled={pending || chosen.length === 0} onClick={() => submit("deferred")}>
            {labels.decisions.deferred}
          </Pill>
          {pending ? <span className="self-center text-xs text-[var(--wh-foreground-muted)]">{labels.working}</span> : null}
        </div>
      ) : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

      <ul className="divide-y divide-[var(--wh-border)]">
        {rows.map((row) =>
          selecting ? (
            <li key={row.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--wh-radius-sm)] px-2 py-3 has-[:checked]:bg-[var(--wh-primary-soft)]/40">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-[var(--wh-primary)]"
                  checked={picked.has(row.id)}
                  onChange={(event) =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(row.id);
                      else next.delete(row.id);
                      return next;
                    })
                  }
                  aria-label={labels.pick.replace("{claim}", row.claim)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug">{row.claim}</span>
                  <span className="block text-xs text-[var(--wh-foreground-subtle)]">{row.meta}</span>
                </span>
              </label>
            </li>
          ) : (
            <li key={row.id} className="list-none">
              <ul>{row.node}</ul>
            </li>
          ),
        )}
      </ul>

      <ConfirmationSheet
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={labels.removeTitle.replace("{count}", String(chosen.length))}
        description={labels.removeLede}
        confirmLabel={labels.decisions.removed}
        cancelLabel={labels.cancel}
        destructive
        pending={pending}
        onConfirm={() => {
          setConfirmRemove(false);
          submit("removed");
        }}
      />
    </div>
  );
}
