"use client";

import { useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

/** The button's words in the viewer's language, with the provider's name already in them (story 22-004). */
export type CheckoutButtonLabels = { go: string; opening: string; failed: string };

/**
 * "Continue to payment" (story 20-010). The server opens the checkout — our
 * price, the provider it routed to — and only then does the browser leave for
 * the provider's own page. Nothing here decides that a payment happened.
 */
export function CheckoutButton({ householdId, planKey, priceId, labels }: { householdId: string; planKey: string; priceId: string; labels: CheckoutButtonLabels }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/households/${householdId}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toPlanKey: planKey, priceId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.checkout?.url) throw new Error(payload?.error?.message ?? labels.failed);
      window.location.assign(payload.checkout.url as string);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.failed);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {error ? <Alert>{error}</Alert> : null}
      <Button type="button" className="min-h-12 w-full rounded-[var(--wh-radius-pill)] text-base" onClick={() => void go()} disabled={busy}>
        {busy ? labels.opening : labels.go}
      </Button>
    </div>
  );
}
