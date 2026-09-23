/**
 * The entitlement service (stories 20-001, 20-002, 20-003).
 *
 * One place answers "may this household use this?". Every domain module asks
 * here and none of them knows what a plan is called or what it costs — the
 * acceptance criterion is explicit that the check is "server-side through one
 * entitlement service", and five copies of a rule is five chances to differ.
 *
 * The decision is a pure function of plan data and current usage, so it can be
 * made in a request, in a worker, in a tool gate and in a test, and give the
 * same answer every time.
 */

export const FEATURES = {
  "household.outcomes": "Outcomes and routines",
  "household.notifications": "Actionable notifications",
  "home.maintenance": "Maintenance, laundry and pet care",
  "home.weather": "Weather-aware planning",
  "conversation.text": "Text conversation",
  "conversation.voice": "Voice conversation",
  "ai.agent_runs": "Background agent runs",
  "ai.autonomous_action": "Acting without asking first",
  "school.connector": "School and homework",
  "commerce.orders": "Ordering and groceries",
  "meals.planning": "Meal planning",
  "finance.bills": "Bills and payments",
  "family.events": "Family time and social",
  "integrations.deep": "Deep provider integrations",
  "health.tracking": "Health and fitness",
} as const;

export type FeatureKey = keyof typeof FEATURES;

export type PlanFeature = {
  featureKey: string;
  enabled: boolean;
  /** Null means unlimited. Zero means listed but unusable. */
  limitPerPeriod: number | null;
  period: "day" | "month" | "year" | "forever";
  /**
   * At most this many uses per fixed `burstWindowSeconds` window (story
   * 20-007) — the spike a script or a stuck client makes. Null or absent: no
   * burst policy.
   */
  burstLimit?: number | null;
  burstWindowSeconds?: number | null;
  /**
   * Uses in the period past which the household is served more cheaply,
   * never refused (story 20-007). Null or absent: no fair-use level.
   */
  fairUseLimit?: number | null;
};

export type Subscription = {
  planKey: string;
  status: "active" | "past_due" | "cancelled" | "paused";
  features: readonly PlanFeature[];
  currentPeriodStart: Date;
};

export type EntitlementDecision =
  | {
      allowed: true;
      remaining: number | null;
      reason: string;
      /** Where the household stands against the plan's fair-use level, when it has one (story 20-007). */
      fairUse?: "within" | "over";
    }
  | { allowed: false; code: EntitlementRefusal; reason: string; remaining: 0 };

export type EntitlementRefusal =
  | "not_in_plan"
  | "quota_exhausted"
  | "subscription_inactive"
  | "no_subscription"
  /** Too many uses in a short window; temporary, and nothing was lost (story 20-007). */
  | "burst_limited";

/**
 * Whether a household may use a feature right now.
 *
 * A cancelled or unpaid subscription keeps read access to everything the
 * household already has — the criterion says downgrades never delete data and
 * unavailable capabilities fail gracefully. What stops is the work that costs
 * something: metered features and anything that reaches a provider.
 */
export function checkEntitlement(input: {
  subscription: Subscription | null;
  feature: FeatureKey | string;
  /** How much of the allowance is already spent this period. */
  used?: number;
  /** How much this call would consume. Defaults to one. */
  amount?: number;
}): EntitlementDecision {
  const { subscription, feature } = input;
  const used = input.used ?? 0;
  const amount = input.amount ?? 1;

  if (!subscription) {
    return {
      allowed: false,
      code: "no_subscription",
      reason: "This household is not on a plan.",
      remaining: 0,
    };
  }

  const entry = subscription.features.find((candidate) => candidate.featureKey === feature);
  if (!entry || !entry.enabled) {
    return {
      allowed: false,
      code: "not_in_plan",
      reason: `${describe(feature)} is not part of this household's plan.`,
      remaining: 0,
    };
  }

  if (subscription.status !== "active" && entry.limitPerPeriod !== null) {
    // Metered work stops when billing lapses; unmetered features the household
    // already relies on keep working, because taking those away would punish a
    // family for a card that expired.
    return {
      allowed: false,
      code: "subscription_inactive",
      reason: "This household's plan is not currently active.",
      remaining: 0,
    };
  }

  if (entry.limitPerPeriod === null) {
    return { allowed: true, remaining: null, reason: `${describe(feature)} is included.` };
  }

  const remaining = entry.limitPerPeriod - used;
  if (remaining < amount) {
    return {
      allowed: false,
      code: "quota_exhausted",
      reason: `This household has used its ${describe(feature).toLowerCase()} allowance for the period.`,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    remaining: remaining - amount,
    reason: `${remaining} of ${entry.limitPerPeriod} left this period.`,
  };
}

export function describe(feature: string): string {
  return (FEATURES as Record<string, string>)[feature] ?? feature;
}

/**
 * The start of the period a usage counter belongs to.
 *
 * Periods are aligned to the calendar rather than to a signup date, so two
 * households' counters roll over together and a support conversation never has
 * to work out whose month started when.
 */
export function periodStart(period: PlanFeature["period"], now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);

  switch (period) {
    case "day":
      return start;
    case "month":
      start.setUTCDate(1);
      return start;
    case "year":
      start.setUTCMonth(0, 1);
      return start;
    case "forever":
      // One bucket for all time, so an unmetered feature still has somewhere to
      // count if it is ever metered later.
      return new Date(0);
  }
}

/** What a client may render, derived from the same data the server enforces. */
export function featureSummary(subscription: Subscription | null): {
  planKey: string | null;
  features: { featureKey: string; label: string; limit: number | null; period: string }[];
} {
  if (!subscription) return { planKey: null, features: [] };

  return {
    planKey: subscription.planKey,
    features: subscription.features
      .filter((feature) => feature.enabled)
      .map((feature) => ({
        featureKey: feature.featureKey,
        label: describe(feature.featureKey),
        limit: feature.limitPerPeriod,
        period: feature.period,
      })),
  };
}
