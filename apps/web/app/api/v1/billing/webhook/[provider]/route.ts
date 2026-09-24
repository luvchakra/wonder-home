import { billingProviderNamed } from "@wonderhome/core/billing/router";
import { handleBillingWebhook } from "@wonderhome/core/billing/webhook";
import { createAdminClient } from "@wonderhome/core/db/admin";

/**
 * One payment provider's webhook (story 20-009): `/api/v1/billing/webhook/razorpay`
 * and `/api/v1/billing/webhook/stripe`. Everything it does is
 * `handleBillingWebhook` (`packages/core/src/billing/webhook.ts`), with the
 * provider named in the path — so a Razorpay signature is only ever checked
 * against Razorpay's secret, and a Stripe one against Stripe's.
 *
 * A provider this deployment has not configured refuses with the same 401 as
 * a bad signature, so neither is distinguishable from outside.
 */
type Params = { params: Promise<{ provider: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { provider } = await params;
  return handleBillingWebhook(request, { provider: billingProviderNamed(provider), admin: createAdminClient });
}

export const dynamic = "force-dynamic";
