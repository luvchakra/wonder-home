import { z } from "zod";

import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { requirePlatformAdmin } from "@wonderhome/core/platform/admin";
import { PAYMENT_REFUND_REASON_CODES, staffRefund } from "@wonderhome/core/platform/payments";

/**
 * A staff refund (story 20-011). Pending until the provider's own refund
 * event confirms it; the refund row's id is the provider's idempotency key.
 * Requires `payments.refund` and a reason code.
 */
type Params = { params: Promise<{ paymentId: string }> };

const refundSchema = z.object({
  // Major units, as a person reads them; omitted means whatever is left to refund.
  amount: z.number().positive().max(10_000_000).optional(),
  reasonCode: z.enum(PAYMENT_REFUND_REASON_CODES),
});

export async function POST(request: Request, { params }: Params) {
  const { paymentId } = await params;
  return defineRoute(
    { input: refundSchema, authenticate: async () => requirePlatformAdmin(await createClient()) },
    async ({ body, actor }) => ({ refund: await staffRefund(createAdminClient(), actor, { paymentId, amount: body.amount, reasonCode: body.reasonCode }) }),
  )(request);
}

export const dynamic = "force-dynamic";
