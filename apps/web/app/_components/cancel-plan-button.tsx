"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

/** The button's words in the viewer's language, with the plan and date already in them (story 22-004). */
export type CancelPlanLabels = {
  cancel: string;
  /** What will happen, in full: the plan, until when, and that nothing is refunded or deleted. */
  explain: string;
  cancelling: string;
  keep: string;
  failed: string;
};

/**
 * "Cancel at the end of the period" (story 20-010). Two steps, like changing a
 * plan: the first says exactly what will happen, the second does it. The plan
 * stays until the period ends; nothing is refunded or deleted.
 */
export function CancelPlanButton({ householdId, labels }: { householdId: string; labels: CancelPlanLabels }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/households/${householdId}/plan/cancel`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? labels.failed);
      setAsking(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.failed);
    } finally {
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <Button type="button" variant="quiet" className="-ml-2 mt-1" onClick={() => setAsking(true)}>
        {labels.cancel}
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
      {error ? <Alert>{error}</Alert> : null}
      <p className="text-sm">{labels.explain}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void cancel()} disabled={busy}>
          {busy ? labels.cancelling : labels.cancel}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAsking(false)} disabled={busy}>
          {labels.keep}
        </Button>
      </div>
    </div>
  );
}
