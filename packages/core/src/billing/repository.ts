import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkEntitlement,
  periodStart,
  type EntitlementDecision,
  type FeatureKey,
  type PlanFeature,
  type Subscription,
} from "./entitlements";

/**
 * Reading plans and usage, and spending an allowance (20-002, 20-003).
 *
 * The important function here is `consume`. It asks the database to increment
 * and check in one statement, because a read-then-write in application code
 * lets two concurrent requests both see the last unit of an allowance and both
 * spend it. The acceptance criterion asks for exactly that atomicity.
 */

type Row = Record<string, unknown>;

/** A household with no subscription row is on Free rather than on nothing. */
export const DEFAULT_PLAN_KEY = "free";

export async function loadSubscription(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Subscription | null> {
  const { data: subscriptionRow, error: subscriptionError } = await supabase
    .from("household_subscriptions")
    .select("plan_key, status, current_period_start")
    .eq("household_id", householdId)
    .maybeSingle();

  if (subscriptionError) {
    throw new Error(`loadSubscription failed: ${subscriptionError.code ?? "unknown"}`);
  }

  const planKey = (subscriptionRow?.plan_key as string | undefined) ?? DEFAULT_PLAN_KEY;

  const { data: featureRows, error: featureError } = await supabase
    .from("plan_features")
    .select("feature_key, enabled, limit_per_period, period")
    .eq("plan_key", planKey);

  if (featureError) throw new Error(`loadSubscription failed: ${featureError.code ?? "unknown"}`);

  const features: PlanFeature[] = (featureRows ?? []).map((row: Row) => ({
    featureKey: row.feature_key as string,
    enabled: row.enabled as boolean,
    limitPerPeriod: (row.limit_per_period as number | null) ?? null,
    period: row.period as PlanFeature["period"],
  }));

  // No plan_features rows at all means the catalogue has not been seeded, which
  // is a deployment fault rather than a household on an empty plan. Reporting
  // "no subscription" is the honest answer and fails closed.
  if (features.length === 0) return null;

  return {
    planKey,
    status: (subscriptionRow?.status as Subscription["status"] | undefined) ?? "active",
    features,
    currentPeriodStart: subscriptionRow?.current_period_start
      ? new Date(subscriptionRow.current_period_start as string)
      : periodStart("month"),
  };
}

export async function usedThisPeriod(
  supabase: SupabaseClient,
  householdId: string,
  feature: string,
  period: PlanFeature["period"],
  now: Date = new Date(),
): Promise<number> {
  const { data, error } = await supabase
    .from("usage_counters")
    .select("used")
    .eq("household_id", householdId)
    .eq("feature_key", feature)
    .eq("period_start", periodStart(period, now).toISOString())
    .maybeSingle();

  if (error) throw new Error(`usedThisPeriod failed: ${error.code ?? "unknown"}`);
  return Number(data?.used ?? 0);
}

/**
 * Whether a household may use a feature, without spending anything.
 *
 * For a read path, or to decide what to offer. Anything that actually does the
 * work should call `consume` instead, so the check and the spend cannot drift
 * apart between the two calls.
 */
export async function may(
  supabase: SupabaseClient,
  householdId: string,
  feature: FeatureKey | string,
  now: Date = new Date(),
): Promise<EntitlementDecision> {
  const subscription = await loadSubscription(supabase, householdId);
  const entry = subscription?.features.find((candidate) => candidate.featureKey === feature);

  const used =
    entry && entry.limitPerPeriod !== null
      ? await usedThisPeriod(supabase, householdId, feature, entry.period, now)
      : 0;

  return checkEntitlement({ subscription, feature, used });
}

/**
 * Spends one unit of a feature's allowance, atomically.
 *
 * The increment happens first and the answer comes back with it, so two
 * requests racing for the last unit cannot both be told yes. A refused call
 * still leaves the count truthful — the work was attempted, and a meter that
 * quietly forgets attempts cannot be reconciled against a bill.
 */
export async function consume(
  supabase: SupabaseClient,
  householdId: string,
  feature: FeatureKey | string,
  options: { amount?: number; now?: Date } = {},
): Promise<EntitlementDecision> {
  const now = options.now ?? new Date();
  const amount = options.amount ?? 1;

  const subscription = await loadSubscription(supabase, householdId);
  const gate = checkEntitlement({ subscription, feature, used: 0, amount: 0 });

  // Not in the plan at all, or the plan is inactive: nothing to meter.
  if (!gate.allowed) return gate;

  const entry = subscription!.features.find((candidate) => candidate.featureKey === feature)!;
  if (entry.limitPerPeriod === null) {
    return { allowed: true, remaining: null, reason: "Included in this plan." };
  }

  const { data, error } = await supabase.rpc("record_usage", {
    p_household_id: householdId,
    p_feature_key: feature,
    p_period_start: periodStart(entry.period, now).toISOString(),
    p_amount: amount,
    p_limit: entry.limitPerPeriod,
  });

  if (error) throw new Error(`consume failed: ${error.code ?? "unknown"}`);

  const result = (Array.isArray(data) ? data[0] : data) as { used: number; allowed: boolean } | null;
  const used = Number(result?.used ?? 0);

  if (!result?.allowed) {
    return {
      allowed: false,
      code: "quota_exhausted",
      reason: "This household has used its allowance for the period.",
      remaining: 0,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, entry.limitPerPeriod - used),
    reason: `${Math.max(0, entry.limitPerPeriod - used)} of ${entry.limitPerPeriod} left this period.`,
  };
}
