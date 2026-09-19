import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { changePlan, listPlans, loadSubscription, previewPlanChange, type PlanOption } from "../billing/repository";
import { featureSummary } from "../billing/entitlements";
import { describePlanChange, needsConfirmation, type PlanChangeAssessment } from "../billing/plan-change";
import { platformCan, type PlatformAdmin } from "./admin";

/**
 * Subscription administration (story 16-005).
 *
 * The mechanics are exactly the household's own plan-change path (20-004):
 * the same preview, the same re-derived-server-side confirmation, the same
 * single row that changes. What is different here is who may reach it and
 * what leaves a trail when they do — a household reaches its own plan
 * through its own session; staff reach any household's plan through the
 * service-role client, gated by a platform capability, and a reason code
 * that ends up in the audit trail rather than a free-text note `redact()`
 * would only turn into `[redacted]`.
 */

export const SUBSCRIPTION_ADMIN_REASON_CODES = [
  "household_requested",
  "billing_dispute",
  "plan_correction",
  "fraud_review",
  "goodwill_adjustment",
] as const;

export type SubscriptionAdminReasonCode = (typeof SUBSCRIPTION_ADMIN_REASON_CODES)[number];

export type SubscriptionSnapshot = {
  householdId: string;
  current: ReturnType<typeof featureSummary>;
  plans: PlanOption[];
  preview: (PlanChangeAssessment & { lines: string[]; needsConfirmation: boolean }) | null;
};

/**
 * What staff sees before changing anything: the household's current plan,
 * what plans exist, and — when asked about one — what moving to it would do.
 * Never anything about what the household has actually done with the plan;
 * that stays behind support access, which this is not.
 */
export async function subscriptionSnapshot(
  adminClient: SupabaseClient,
  householdId: string,
  toPlanKey?: string,
): Promise<SubscriptionSnapshot> {
  const [current, plans] = await Promise.all([
    loadSubscription(adminClient, householdId),
    listPlans(adminClient),
  ]);

  let preview: SubscriptionSnapshot["preview"] = null;
  if (toPlanKey) {
    const assessment = await previewPlanChange(adminClient, householdId, toPlanKey);
    preview = { ...assessment, lines: describePlanChange(assessment), needsConfirmation: needsConfirmation(assessment) };
  }

  return { householdId, current: featureSummary(current), plans, preview };
}

export type SubscriptionAdminChangeRequest = {
  householdId: string;
  toPlanKey: string;
  reasonCode: SubscriptionAdminReasonCode;
  /** What staff was shown. Re-derived and compared, exactly as 20-004 does for a household. */
  acknowledged?: { stopping: number; exceeded: number };
};

/**
 * Changes a household's plan on staff's behalf.
 *
 * Requires `subscription.manage` — support cannot reach this, matching the
 * same least-privilege split as support-access grants. The change itself is
 * `changePlan`, unmodified: staff gets no shortcut around the re-derived
 * assessment a household would also have to face.
 */
export async function adminChangePlan(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
  request: SubscriptionAdminChangeRequest,
): Promise<{ assessment: PlanChangeAssessment; planKey: string }> {
  if (!platformCan(actor, "subscription.manage")) {
    throw ApiError.forbidden("Your platform role cannot change a household's plan.");
  }

  return changePlan(adminClient, {
    householdId: request.householdId,
    actorProfileId: actor.profileId,
    toPlanKey: request.toPlanKey,
    acknowledged: request.acknowledged,
    reasonCode: request.reasonCode,
  });
}
