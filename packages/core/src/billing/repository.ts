import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { createAdminClient } from "../db/admin";
import { log } from "../observability/logger";
import { dispatchWebhookEvent } from "../webhooks/dispatch";
import {
  checkEntitlement,
  describe,
  periodStart,
  type EntitlementDecision,
  type FeatureKey,
  type PlanFeature,
  type Subscription,
} from "./entitlements";
import { BURST_MESSAGE, burstBucket, describePolicy, fairUseState, needsCounting } from "./policies";
import {
  assessPlanChange,
  needsConfirmation,
  type PlanChangeAssessment,
} from "./plan-change";

/**
 * Reading plans and usage, and spending an allowance (20-002, 20-003).
 *
 * The important function here is `consume`. It asks the database to increment
 * and check in one statement, because a read-then-write in application code
 * lets two concurrent requests both see the last unit of an allowance and both
 * spend it. The acceptance criterion asks for exactly that atomicity.
 */

type Row = Record<string, unknown>;

const FEATURE_COLUMNS = "feature_key, enabled, limit_per_period, period, burst_limit, burst_window_seconds, fair_use_limit";

function featureFromRow(row: Row): PlanFeature {
  const optional = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    featureKey: row.feature_key as string,
    enabled: row.enabled as boolean,
    limitPerPeriod: (row.limit_per_period as number | null) ?? null,
    period: row.period as PlanFeature["period"],
    burstLimit: optional(row.burst_limit),
    burstWindowSeconds: optional(row.burst_window_seconds),
    fairUseLimit: optional(row.fair_use_limit),
  };
}

/** A household with no subscription row is on Free rather than on nothing. */
export const DEFAULT_PLAN_KEY = "free";

/**
 * Memoised per request: a screen asks "may this household…" for each domain
 * it shows, and the subscription behind every answer is the same two rows.
 */
export const loadSubscription = cache(async (
  supabase: SupabaseClient,
  householdId: string,
): Promise<Subscription | null> => {
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
    .select(FEATURE_COLUMNS)
    .eq("plan_key", planKey);

  if (featureError) throw new Error(`loadSubscription failed: ${featureError.code ?? "unknown"}`);

  const features: PlanFeature[] = (featureRows ?? []).map(featureFromRow);

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
});

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

export type FeatureUsage = {
  featureKey: string;
  label: string;
  /** Null for a feature this plan does not meter — nothing to show against. */
  limit: number | null;
  period: PlanFeature["period"];
  /** What has actually been spent this period; null when nothing about the feature is counted. */
  used: number | null;
  /** Past this many uses the household is served more simply, never refused (story 20-007). */
  fairUseLimit: number | null;
  /** The plan's burst and fair-use policies for this feature, as sentences. */
  policies: string[];
};

/**
 * What the household has used, against what its plan allows (story 20-005).
 *
 * The same counters `consume` increments and `may` checks — a screen showing
 * "140 of 500" is reading the number the quota is actually enforced against,
 * not a second copy of it that could drift.
 */
export async function usageSummary(
  supabase: SupabaseClient,
  householdId: string,
  now: Date = new Date(),
): Promise<{ planKey: string | null; features: FeatureUsage[] }> {
  const subscription = await loadSubscription(supabase, householdId);
  if (!subscription) return { planKey: null, features: [] };

  const features: FeatureUsage[] = [];
  for (const feature of subscription.features) {
    if (!feature.enabled) continue;

    const used = needsCounting(feature)
      ? await usedThisPeriod(supabase, householdId, feature.featureKey, feature.period, now)
      : null;

    features.push({
      featureKey: feature.featureKey,
      label: describe(feature.featureKey),
      limit: feature.limitPerPeriod,
      period: feature.period,
      used,
      fairUseLimit: feature.fairUseLimit ?? null,
      policies: describePolicy(feature),
    });
  }

  return { planKey: subscription.planKey, features };
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
  options: {
    amount?: number;
    now?: Date;
    /**
     * Who records the usage. `public.record_usage` is granted to the
     * service role only — metering is the server's to record, never a
     * member's — so this defaults to the admin client. The household was
     * already authorised by the caller; the subscription read above still
     * goes through the member's own client.
     */
    meter?: Pick<SupabaseClient, "rpc">;
  } = {},
): Promise<EntitlementDecision> {
  const now = options.now ?? new Date();
  const amount = options.amount ?? 1;

  const subscription = await loadSubscription(supabase, householdId);
  const gate = checkEntitlement({ subscription, feature, used: 0, amount: 0 });

  // Not in the plan at all, or the plan is inactive: nothing to meter.
  if (!gate.allowed) return gate;

  const entry = subscription!.features.find((candidate) => candidate.featureKey === feature)!;
  const meter = options.meter ?? createAdminClient();

  // A burst policy first (story 20-007): too many uses in a short window is
  // refused for that window only, before anything is spent. Counted per
  // household, in the same fixed-window counters every rate limit uses —
  // and, like them, it lets the request through when the counter cannot be
  // reached: a throttle, never an authorization gate.
  if (entry.burstLimit && entry.burstWindowSeconds) {
    const withinBurst = await hitBurst(meter, feature, householdId, entry.burstLimit, entry.burstWindowSeconds);
    if (!withinBurst) {
      return { allowed: false, code: "burst_limited", reason: BURST_MESSAGE, remaining: 0 };
    }
  }

  // Nothing to count: no allowance and no fair-use level to measure against.
  if (!needsCounting(entry)) {
    return { allowed: true, remaining: null, reason: "Included in this plan." };
  }

  const { data, error } = await meter.rpc("record_usage", {
    p_household_id: householdId,
    p_feature_key: feature,
    p_period_start: periodStart(entry.period, now).toISOString(),
    p_amount: amount,
    // Null is unlimited: a feature with only a fair-use level is counted,
    // never refused, for it.
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

  const fairUse = fairUseState(entry, used);
  const decision: EntitlementDecision =
    entry.limitPerPeriod === null
      ? { allowed: true, remaining: null, reason: "Included in this plan." }
      : {
          allowed: true,
          remaining: Math.max(0, entry.limitPerPeriod - used),
          reason: `${Math.max(0, entry.limitPerPeriod - used)} of ${entry.limitPerPeriod} left this period.`,
        };
  return fairUse ? { ...decision, fairUse } : decision;
}

async function hitBurst(
  meter: Pick<SupabaseClient, "rpc">,
  feature: string,
  householdId: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await meter.rpc("rate_limit_hit", {
      p_bucket: burstBucket(feature),
      p_subject: householdId,
      p_window_seconds: windowSeconds,
      p_max: limit,
    });
    if (error) throw error;
    return data !== false;
  } catch (thrown) {
    log.warn("burst counter unavailable; allowing", { feature, reason: (thrown as { code?: string } | null)?.code ?? "unknown" });
    return true;
  }
}

// ---------------------------------------------------------------------------
// Changing plans (story 20-004)
// ---------------------------------------------------------------------------

export type PlanOption = {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  /** Entered only through a verified payment (story 20-006); never by a direct change. */
  requiresPayment: boolean;
};

/** The plans a household may move to. Data, never a hard-coded list. */
export async function listPlans(supabase: SupabaseClient): Promise<PlanOption[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("key, name, description, sort_order, requires_payment")
    .eq("active", true)
    .order("sort_order");

  if (error) throw new Error(`listPlans failed: ${error.code ?? "unknown"}`);

  return ((data as Row[] | null) ?? []).map((row) => ({
    key: row.key as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    sortOrder: Number(row.sort_order),
    requiresPayment: row.requires_payment === true,
  }));
}

/** Whether a plan can only be entered through a verified payment (story 20-006). */
export async function planRequiresPayment(supabase: SupabaseClient, planKey: string): Promise<boolean> {
  const { data, error } = await supabase.from("plans").select("requires_payment").eq("key", planKey).maybeSingle();
  if (error) throw new Error(`planRequiresPayment failed: ${error.code ?? "unknown"}`);
  return (data as Row | null)?.requires_payment === true;
}

async function featuresOf(supabase: SupabaseClient, planKey: string): Promise<PlanFeature[]> {
  const { data, error } = await supabase
    .from("plan_features")
    .select(FEATURE_COLUMNS)
    .eq("plan_key", planKey);

  if (error) throw new Error(`featuresOf failed: ${error.code ?? "unknown"}`);

  return ((data as Row[] | null) ?? []).map(featureFromRow);
}

/**
 * What moving to this plan would do, without doing it (20-004).
 *
 * Read on the server from plan data and real usage, so the sentences a
 * household is shown are the same facts the change is made against. A preview
 * computed in a browser from a price list would be a different thing that
 * happened to agree most of the time.
 */
export async function previewPlanChange(
  supabase: SupabaseClient,
  householdId: string,
  toPlanKey: string,
  now: Date = new Date(),
): Promise<PlanChangeAssessment> {
  const [from, toFeatures] = await Promise.all([
    loadSubscription(supabase, householdId),
    featuresOf(supabase, toPlanKey),
  ]);

  if (toFeatures.length === 0) throw ApiError.notFound("There is no such plan.");

  // Usage only for features the household currently has: a feature they never
  // had cannot be over a limit, and asking about all of them would be a query
  // per feature for no answer.
  const usage: Record<string, number> = {};
  for (const feature of from?.features ?? []) {
    if (!feature.enabled) continue;
    usage[feature.featureKey] = await usedThisPeriod(
      supabase,
      householdId,
      feature.featureKey,
      feature.period,
      now,
    );
  }

  return assessPlanChange({ from, toPlanKey, toFeatures, usage });
}

/**
 * Moves the household to a plan.
 *
 * Deliberately only ever writes `household_subscriptions`. Nothing in a plan
 * change touches a household's own records — not to tidy them, not to bring
 * them under a new limit, not at all. The one row that changes is the one that
 * says which plan they are on, and everything downstream is the entitlement
 * service reading it.
 *
 * A change that takes a capability away requires the assessment to have been
 * seen. The caller passes back what it showed, and it is re-derived here: a
 * browser that skipped the preview cannot skip the consequence.
 */
export async function changePlan(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    /**
     * The household's own administrator, changing their own plan. Exactly one
     * of `actorMemberId` / `actorProfileId` is set — a household member has no
     * platform-profile-only identity, and platform staff changing a household's
     * plan (16-005) has no membership in it.
     */
    actorMemberId?: string;
    /** Platform staff acting through the admin surface, never a household session. */
    actorProfileId?: string;
    toPlanKey: string;
    /** What the person was shown. Compared against a fresh assessment. */
    acknowledged?: { stopping: number; exceeded: number };
    /**
     * Staff's own reason, for a platform-initiated change. Never asked of a
     * household. A code rather than free text: `redact()` scrubs anything
     * that looks like a note before it reaches `audit_events`, and a code is
     * exactly what "countable and reviewable" needs anyway.
     */
    reasonCode?: string;
  },
  now: Date = new Date(),
): Promise<{ assessment: PlanChangeAssessment; planKey: string }> {
  const assessment = await previewPlanChange(supabase, input.householdId, input.toPlanKey, now);

  // A plan that has to be paid for is entered through a checkout and a
  // verified payment (story 20-006), never by a direct change from a
  // household. Platform staff comping a plan (16-005) is the one exception,
  // and it is audited as theirs. RLS refuses the household path as well.
  if (!input.actorProfileId && (await planRequiresPayment(supabase, input.toPlanKey))) {
    throw ApiError.conflict("This plan is bought through a checkout, not changed directly.", { checkoutRequired: true });
  }

  if (assessment.fromPlanKey === input.toPlanKey) {
    throw ApiError.conflict("This household is already on that plan.");
  }

  if (needsConfirmation(assessment)) {
    const seen = input.acknowledged;
    const matches =
      seen && seen.stopping === assessment.stopping.length && seen.exceeded === assessment.exceeded.length;

    // Not a formality. If the counts moved between the preview and the click,
    // the household agreed to a different change from the one about to happen.
    if (!matches) {
      throw ApiError.conflict(
        "What this change does has moved since you were shown it. Here it is again.",
        { assessment },
      );
    }
  }

  const { error } = await supabase
    .from("household_subscriptions")
    .upsert(
      {
        household_id: input.householdId,
        plan_key: input.toPlanKey,
        status: "active",
        current_period_start: periodStart("month", now).toISOString(),
      },
      { onConflict: "household_id" },
    );

  if (error) {
    if (error.code === "42501") {
      throw ApiError.forbidden("Only an Admin can change the plan.");
    }
    throw new Error(`changePlan failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.actorMemberId ?? null,
    actorProfileId: input.actorProfileId ?? null,
    eventType: "subscription.changed",
    targetTable: "household_subscriptions",
    targetId: input.householdId,
    // Keys and counts. What a plan costs is not this product's business to
    // record, and the feature names are enough to explain the change later.
    metadata: {
      from: assessment.fromPlanKey,
      to: assessment.toPlanKey,
      direction: assessment.direction,
      stopping: assessment.stopping.map((entry) => entry.featureKey),
      exceeded: assessment.exceeded.map((entry) => entry.featureKey),
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    },
  });

  await dispatchWebhookEvent({
    householdId: input.householdId,
    eventType: "subscription.changed",
    data: { from: assessment.fromPlanKey, to: assessment.toPlanKey, direction: assessment.direction },
  });

  return { assessment, planKey: input.toPlanKey };
}
