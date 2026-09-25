"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PlanChangeAssessment } from "@wonderhome/core/billing/plan-change";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Badge } from "@wonderhome/core/ui/pill";

/**
 * Changing the household's plan (story 20-004).
 *
 * Two steps, and never one. Picking a plan asks the server what that would do;
 * only then is there a button that does it. A single click that changed the
 * plan and discovered the consequences afterwards is how a household loses a
 * capability they were using and finds out from a screen that has stopped
 * working.
 *
 * The consequences are the server's sentences, not this component's. A browser
 * that composed its own version could get it wrong, get it out of date, or get
 * it kinder — and the kind version is the dangerous one.
 */

type PlanOption = {
  key: string;
  name: string;
  description: string | null;
  /** The catalogue's price for the chosen interval, already in words: "₹299 a month". */
  priceText?: string | null;
  /** The arithmetic behind a yearly price: "₹239.16 a month · save 20%". */
  priceNote?: string | null;
  /** Priced, but switching is free until payments open (story 20-010). */
  earlyAccess?: boolean;
  /** Our catalogue price for this interval — what a checkout would charge. */
  priceId?: string | null;
};
type Preview = PlanChangeAssessment & {
  lines: string[];
  needsConfirmation: boolean;
  /** Confirming goes to the payment provider's page (story 20-006). */
  checkout?: boolean;
  /** A paid plan with no way to pay for it here yet. */
  unavailable?: boolean;
};

/** The form's words in the viewer's language, built on the server (story 22-004). */
export type PlanFormLabels = {
  earlyAccess: string;
  current: string;
  checking: string;
  seeChanges: string;
  changed: string;
  /** "Moving to {plan}" — `{plan}` is filled in here with the chosen plan's name. */
  movingTo: string;
  cantBuy: string;
  openingPayment: string;
  changing: string;
  continueToPayment: string;
  understandChange: string;
  change: string;
  leave: string;
  workOutFailed: string;
  changeFailed: string;
};

export function PlanForm({
  householdId,
  currentPlanKey,
  plans,
  labels,
}: {
  householdId: string;
  currentPlanKey: string | null;
  plans: PlanOption[];
  labels: PlanFormLabels;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);

  const ask = async (planKey: string) => {
    setBusy(true);
    setError(null);
    setDone(null);
    setChosen(planKey);
    setPreview(null);

    try {
      const response = await fetch(`/api/v1/households/${householdId}/plan?to=${encodeURIComponent(planKey)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? labels.workOutFailed);
      setPreview(payload.preview as Preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.workOutFailed);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!chosen || !preview) return;
    // A priced plan that needs payment: our checkout summary shows what will
    // be charged, and by whom, before anyone is sent to a provider (story 20-010).
    const priceId = plans.find((plan) => plan.key === chosen)?.priceId;
    if (preview.checkout && priceId) {
      router.push(`/settings/plan/checkout?plan=${encodeURIComponent(chosen)}&price=${encodeURIComponent(priceId)}`);
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/households/${householdId}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toPlanKey: chosen,
          // What was on screen. The server re-derives and compares, so a
          // change that moved while somebody read it is refused.
          acknowledged: { stopping: preview.stopping.length, exceeded: preview.exceeded.length },
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? labels.changeFailed);

      // A paid plan: the provider's page takes it from here, and the plan
      // changes when the payment is confirmed — not on this click.
      // (A catalogue price goes through our checkout summary first; see below.)
      if (payload.checkout?.url) {
        window.location.assign(payload.checkout.url as string);
        return;
      }

      setDone(payload.changed.lines as string[]);
      setPreview(null);
      setChosen(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.changeFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      {done ? (
        <Alert tone="info">
          <span className="block font-semibold">{labels.changed}</span>
          {done.map((line) => (
            <span key={line} className="mt-1 block">{line}</span>
          ))}
        </Alert>
      ) : null}

      <ul className="space-y-2">
        {plans.map((plan) => {
          const current = plan.key === (currentPlanKey ?? "free");
          return (
            // On a phone the action sits under the plan, so the name, price and
            // description keep the full width (rules 11 and 15).
            <li key={plan.key} className="flex flex-col gap-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                  {plan.name}
                  {plan.earlyAccess && plan.priceText ? <Badge tone="handled" className="whitespace-nowrap">{labels.earlyAccess}</Badge> : null}
                </p>
                {plan.priceText ? (
                  <p className="mt-0.5 text-sm">
                    <span className="font-semibold">{plan.priceText}</span>
                    {plan.priceNote ? <span className="ml-1.5 text-xs text-[var(--wh-foreground-muted)]">{plan.priceNote}</span> : null}
                  </p>
                ) : null}
                {plan.description ? (
                  <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{plan.description}</p>
                ) : null}
              </div>
              {current ? (
                <Badge tone="handled" className="w-fit">{labels.current}</Badge>
              ) : (
                <Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={busy} onClick={() => void ask(plan.key)}>
                  {busy && chosen === plan.key ? labels.checking : labels.seeChanges}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {preview ? (
        <div
          className={
            preview.needsConfirmation
              ? "space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)]/60 p-4"
              : "space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-4"
          }
        >
          <p className="text-sm font-semibold">
            {labels.movingTo.replace("{plan}", plans.find((plan) => plan.key === chosen)?.name ?? chosen ?? "")}
          </p>
          <ul className="space-y-1.5">
            {preview.lines.map((line) => (
              <li key={line} className="text-sm text-[var(--wh-foreground-muted)]">{line}</li>
            ))}
          </ul>
          {preview.unavailable ? (
            <p className="text-sm">{labels.cantBuy}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {preview.unavailable ? null : (
              <Button type="button" onClick={() => void apply()} disabled={busy}>
                {busy
                  ? preview.checkout
                    ? labels.openingPayment
                    : labels.changing
                  : preview.checkout
                    ? labels.continueToPayment
                    : preview.needsConfirmation
                      ? labels.understandChange
                      : labels.change}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => { setPreview(null); setChosen(null); }}>
              {labels.leave}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
