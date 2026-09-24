import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { featureSummary } from "@wonderhome/core/billing/entitlements";
import { describePlanChange, needsConfirmation } from "@wonderhome/core/billing/plan-change";
import { billingProviderFromEnv, startCheckout } from "@wonderhome/core/billing/checkout";
import {
  changePlan,
  listPlans,
  loadSubscription,
  planRequiresPayment,
  previewPlanChange,
} from "@wonderhome/core/billing/repository";
import { ApiError } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";

/**
 * The household's plan, and changing it (story 20-004).
 *
 * GET is for any member: what plan you are on, what is available, and — when
 * asked about one — exactly what moving to it would do. POST makes the change,
 * and only for an administrator.
 *
 * The preview is computed here rather than in the browser, from plan data and
 * the household's real usage, so the sentences somebody reads are the same
 * facts the change is made against. A preview assembled from a price list in a
 * client would be a different thing that happened to agree most of the time.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const [current, plans] = await Promise.all([
      loadSubscription(supabase, householdId),
      listPlans(supabase),
    ]);

    const to = new URL(request.url).searchParams.get("to");
    if (!to) return { current: featureSummary(current), plans };

    const assessment = await previewPlanChange(supabase, householdId, to);
    const provider = billingProviderFromEnv();
    const requiresPayment = plans.find((plan) => plan.key === to)?.requiresPayment ?? false;
    return {
      current: featureSummary(current),
      plans,
      preview: {
        ...assessment,
        lines: describePlanChange(assessment),
        needsConfirmation: needsConfirmation(assessment),
        // Whether confirming goes to a payment page (story 20-006). Only ever
        // true when a real provider sells this plan: a checkout that goes
        // nowhere is never offered.
        checkout: requiresPayment && Boolean(provider?.live && provider.sells(to)),
        unavailable: requiresPayment && !(provider?.live && provider.sells(to)),
      },
    };
  })(request);
}

const changeSchema = z.object({
  toPlanKey: z.string().min(1).max(40),
  /**
   * What the person was shown. Re-derived on the server and compared, so a
   * browser that skipped the preview cannot skip the consequence.
   */
  acknowledged: z.object({ stopping: z.number().int().min(0), exceeded: z.number().int().min(0) }).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: changeSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId);

    // A paid plan goes through a checkout, and the plan changes only once
    // the provider's verified webhook says it was paid (story 20-006).
    if (await planRequiresPayment(supabase, body.toPlanKey)) {
      const provider = billingProviderFromEnv();
      if (!provider?.live || !provider.sells(body.toPlanKey)) {
        throw ApiError.conflict("This plan can't be bought here yet. Nothing has changed.");
      }
      const checkout = await startCheckout(supabase, createAdminClient(), {
        householdId,
        memberId: membership.memberId,
        toPlanKey: body.toPlanKey,
        provider,
        returnUrl: new URL("/settings/plan", request.url).toString(),
      });
      return { checkout: { url: checkout.url, reused: checkout.reused } };
    }

    const { assessment, planKey } = await changePlan(supabase, {
      householdId,
      actorMemberId: membership.memberId,
      toPlanKey: body.toPlanKey,
      acknowledged: body.acknowledged,
    });

    return { planKey, changed: { ...assessment, lines: describePlanChange(assessment) } };
  })(request);
}

export const dynamic = "force-dynamic";
