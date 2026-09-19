import { z } from "zod";

import { defineRoute } from "@wonderhome/core/api/route";
import { describePlanChange } from "@wonderhome/core/billing/plan-change";
import {
  SUBSCRIPTION_ADMIN_REASON_CODES,
  adminChangePlan,
  subscriptionSnapshot,
} from "@wonderhome/core/platform/subscriptions";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { requirePlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * Subscription administration for one household (story 16-005).
 *
 * GET mirrors the household's own plan endpoint — current plan, the
 * catalogue, and a preview when asked about one — read through the
 * service-role client because staff have no membership to read through.
 * POST applies a change, gated on `subscription.manage` and a reason code
 * rather than the household's own admin-role check.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: async () => requirePlatformAdmin(await createClient()) }, async () => {
    const to = new URL(request.url).searchParams.get("to") ?? undefined;
    return subscriptionSnapshot(createAdminClient(), householdId, to);
  })(request);
}

const changeSchema = z.object({
  toPlanKey: z.string().min(1).max(40),
  reasonCode: z.enum(SUBSCRIPTION_ADMIN_REASON_CODES),
  acknowledged: z.object({ stopping: z.number().int().min(0), exceeded: z.number().int().min(0) }).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute(
    { input: changeSchema, authenticate: async () => requirePlatformAdmin(await createClient()) },
    async ({ body, actor }) => {
      const { planKey, assessment } = await adminChangePlan(createAdminClient(), actor, {
        householdId,
        toPlanKey: body.toPlanKey,
        reasonCode: body.reasonCode,
        acknowledged: body.acknowledged,
      });

      return { planKey, changed: { ...assessment, lines: describePlanChange(assessment) } };
    },
  )(request);
}

export const dynamic = "force-dynamic";
