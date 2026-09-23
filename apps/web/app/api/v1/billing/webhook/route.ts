import { billingProviderFromEnv } from "@wonderhome/core/billing/checkout";
import { handleBillingWebhook } from "@wonderhome/core/billing/webhook";
import { createAdminClient } from "@wonderhome/core/db/admin";

/**
 * The billing provider's webhook (story 20-006). Everything it does is
 * `handleBillingWebhook` (`packages/core/src/billing/webhook.ts`).
 *
 * Real only once a deployment sets `WONDERHOME_BILLING_PROVIDER`, the
 * provider's secret and webhook secret, and a price for each plan it sells —
 * an account and a pricing decision are a person's errand, not something this
 * code can make up. Unconfigured, it is a 404.
 */
export async function POST(request: Request): Promise<Response> {
  return handleBillingWebhook(request, { provider: billingProviderFromEnv(), admin: createAdminClient });
}

export const dynamic = "force-dynamic";
