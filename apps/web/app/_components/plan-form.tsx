"use client";

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

type PlanOption = { key: string; name: string; description: string | null };
type Preview = PlanChangeAssessment & { lines: string[]; needsConfirmation: boolean };

export function PlanForm({
  householdId,
  currentPlanKey,
  plans,
}: {
  householdId: string;
  currentPlanKey: string | null;
  plans: PlanOption[];
}) {
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
      if (!response.ok) throw new Error(payload?.error?.message ?? "We could not work that out just now.");
      setPreview(payload.preview as Preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not work that out just now.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!chosen || !preview) return;
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
      if (!response.ok) throw new Error(payload?.error?.message ?? "We could not change the plan just now.");

      setDone(payload.changed.lines as string[]);
      setPreview(null);
      setChosen(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not change the plan just now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      {done ? (
        <Alert tone="info">
          <span className="block font-semibold">Plan changed.</span>
          {done.map((line) => (
            <span key={line} className="mt-1 block">{line}</span>
          ))}
        </Alert>
      ) : null}

      <ul className="space-y-2">
        {plans.map((plan) => {
          const current = plan.key === (currentPlanKey ?? "free");
          return (
            <li key={plan.key} className="flex items-center gap-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{plan.name}</p>
                {plan.description ? (
                  <p className="text-xs text-[var(--wh-foreground-muted)]">{plan.description}</p>
                ) : null}
              </div>
              {current ? (
                <Badge tone="handled">Current</Badge>
              ) : (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void ask(plan.key)}>
                  {busy && chosen === plan.key ? "Checking…" : "See what changes"}
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
            Moving to {plans.find((plan) => plan.key === chosen)?.name ?? chosen}
          </p>
          <ul className="space-y-1.5">
            {preview.lines.map((line) => (
              <li key={line} className="text-sm text-[var(--wh-foreground-muted)]">{line}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void apply()} disabled={busy}>
              {busy ? "Changing…" : preview.needsConfirmation ? "I understand — change the plan" : "Change the plan"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setPreview(null); setChosen(null); }}>
              Leave it as it is
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
