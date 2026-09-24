import { billingProviderNamed } from "@wonderhome/core/billing/router";
import { handleBillingWebhook } from "@wonderhome/core/billing/webhook";
import { createAdminClient } from "@wonderhome/core/db/admin";

/**
 * Stripe's webhook at its original address (story 20-006), kept so an endpoint
 * already registered keeps working. New endpoints use
 * `/api/v1/billing/webhook/<provider>` (story 20-009). Everything it does is
 * `handleBillingWebhook` (`packages/core/src/billing/webhook.ts`).
 *
 * Real only once a deployment enables Stripe (`WONDERHOME_BILLING_PROVIDERS`),
 * sets its secret and webhook secret, and prices the plans it sells —
 * an account and a pricing decision are a person's errand, not something this
 * code can make up. Unconfigured, it refuses with the same 401 as a bad signature.
 */
export async function POST(request: Request): Promise<Response> {
  return handleBillingWebhook(request, { provider: billingProviderNamed("stripe"), admin: createAdminClient });
}

export const dynamic = "force-dynamic";
