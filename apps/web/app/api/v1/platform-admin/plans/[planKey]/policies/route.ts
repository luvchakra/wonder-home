import { z } from "zod";

import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { BURST_WINDOW_BOUNDS, POLICY_REASON_CODES, planPolicies, policyHistory, setFeaturePolicy } from "@wonderhome/core/billing/policies";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { platformCan, requirePlatformAdmin, type PlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * A plan's fair-use and burst policies (story 20-007).
 *
 * GET reads every feature of the plan with its allowance and policies, and
 * the recorded changes to them. PATCH sets one feature's policy. Both need
 * `subscription.manage` — a plan is platform data, belonging to no one
 * household — and a change needs a reason code, kept with who made it and
 * the before and after in `plan_policy_events`.
 */
type Params = { params: Promise<{ planKey: string }> };

async function requireSubscriptionManager(): Promise<PlatformAdmin> {
  const actor = await requirePlatformAdmin(await createClient());
  if (!platformCan(actor, "subscription.manage")) throw ApiError.forbidden("Your platform role cannot change plan policies.");
  return actor;
}

export async function GET(request: Request, { params }: Params) {
  const { planKey } = await params;

  return defineRoute({ authenticate: requireSubscriptionManager }, async () => {
    const admin = createAdminClient();
    const [features, history] = await Promise.all([planPolicies(admin, planKey), policyHistory(admin, planKey)]);
    return { planKey, features, history };
  })(request);
}

const whole = (min: number, max?: number) => {
  const base = z.number().int().min(min);
  return (max === undefined ? base : base.max(max)).nullable();
};

const policySchema = z.object({
  featureKey: z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/),
  burstLimit: whole(1),
  burstWindowSeconds: whole(BURST_WINDOW_BOUNDS.min, BURST_WINDOW_BOUNDS.max),
  fairUseLimit: whole(1),
  reasonCode: z.enum(POLICY_REASON_CODES),
});

export async function PATCH(request: Request, { params }: Params) {
  const { planKey } = await params;

  return defineRoute({ input: policySchema, authenticate: requireSubscriptionManager }, async ({ body, actor }) => {
    const result = await setFeaturePolicy(createAdminClient(), {
      planKey,
      featureKey: body.featureKey,
      actorProfileId: actor.profileId,
      reasonCode: body.reasonCode,
      policy: { burstLimit: body.burstLimit, burstWindowSeconds: body.burstWindowSeconds, fairUseLimit: body.fairUseLimit },
    });
    return { planKey, ...result };
  })(request);
}

export const dynamic = "force-dynamic";
