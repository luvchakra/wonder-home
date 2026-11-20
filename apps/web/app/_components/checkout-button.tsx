"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

/** The button's words in the viewer's language, with the provider's name already in them (story 22-004). */
export type CheckoutButtonLabels = { go: string; opening: string; failed: string };

type CheckoutClient = { kind: "razorpay"; keyId: string; subscriptionId: string };

type RazorpayInstance = { open(): void; on(event: string, handler: () => void): void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

/** Razorpay's own Checkout script, loaded only when a Razorpay checkout is about to open. */
export const RAZORPAY_CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<RazorpayConstructor | null> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve((window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

/**
 * "Continue to payment" (story 20-010). The server opens the checkout — our
 * price, the provider it routed to. Razorpay opens in place with the
 * subscription id; if its script can't load, the browser goes to Razorpay's
 * hosted page instead. Either way, nothing here decides that a payment
 * happened: the confirmation page waits for the provider's verified webhook.
 */
export function CheckoutButton({ householdId, planKey, priceId, labels }: { householdId: string; planKey: string; priceId: string; labels: CheckoutButtonLabels }) {
  const router = useRouter();
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
      const client = payload.checkout.client as CheckoutClient | null | undefined;
      if (client?.kind === "razorpay") {
        const Razorpay = await loadRazorpay();
        if (Razorpay) {
          const checkout = new Razorpay({
            key: client.keyId,
            subscription_id: client.subscriptionId,
            name: "WonderHome",
            // Razorpay's handler fires once it has taken the payment; the plan
            // still changes only when its signed webhook reaches us.
            handler: () => router.push("/settings/plan/confirmed?checkout=complete"),
            modal: { ondismiss: () => setBusy(false) },
          });
          checkout.on("payment.failed", () => setBusy(false));
          checkout.open();
          return;
        }
      }
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
