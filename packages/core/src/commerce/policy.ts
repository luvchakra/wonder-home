/**
 * Purchase policy (stories 09-004, 09-005).
 *
 * One deterministic function decides whether WonderHome may buy something:
 * allow, needs approval, or refuse. The acceptance criterion asks for exactly
 * that — a result "that can be consumed by APIs and AI tools" — because a rule
 * evaluated differently by the agent and by the route is a rule that will
 * eventually spend money nobody agreed to.
 *
 * Nothing here consults the UI, and nothing here is advisory. This is the
 * decision, and the API and the tool gate both call it.
 */

export const POLICY_SCOPES = ["any", "category", "merchant", "consumable"] as const;
export type PolicyScope = (typeof POLICY_SCOPES)[number];

export type PurchasePolicy = {
  scope: PolicyScope;
  /** Null only for the household-wide default. */
  scopeValue: string | null;
  /** Below this, WonderHome may act alone. Null means nothing is automatic. */
  autoApproveUnderMinor: number | null;
  /** Nothing above this proceeds, approval or not. */
  hardLimitMinor: number | null;
  currency: string;
  active: boolean;
};

export type PurchaseRequest = {
  totalMinor: number;
  currency: string;
  category: string;
  merchant: string;
  consumableIds: readonly string[];
};

export type PolicyDecision =
  | { outcome: "allow"; reason: string; matchedScope: PolicyScope }
  | { outcome: "needs_approval"; reason: string; matchedScope: PolicyScope }
  | { outcome: "refuse"; code: PolicyRefusal; reason: string; matchedScope: PolicyScope | null };

export type PolicyRefusal = "over_hard_limit" | "currency_mismatch" | "no_policy" | "not_positive";

/**
 * Specificity order. The narrowest policy that matches wins, so a household can
 * allow small grocery top-ups while still approving everything from one
 * particular merchant.
 */
const SPECIFICITY: Record<PolicyScope, number> = { consumable: 0, merchant: 1, category: 2, any: 3 };

export function selectPolicy(
  policies: readonly PurchasePolicy[],
  request: PurchaseRequest,
): PurchasePolicy | null {
  const matching = policies.filter((policy) => {
    if (!policy.active) return false;

    switch (policy.scope) {
      case "any":
        return true;
      case "category":
        return policy.scopeValue === request.category;
      case "merchant":
        return policy.scopeValue === request.merchant;
      case "consumable":
        return policy.scopeValue !== null && request.consumableIds.includes(policy.scopeValue);
    }
  });

  return matching.sort((a, b) => SPECIFICITY[a.scope] - SPECIFICITY[b.scope])[0] ?? null;
}

/**
 * Whether this purchase may proceed.
 *
 * The default with no policy at all is to ask a person. A household that has
 * never said what WonderHome may buy has not said yes to anything, and reading
 * silence as consent is how autonomous systems lose people's trust the first
 * time they use it.
 */
export function evaluatePurchase(
  policies: readonly PurchasePolicy[],
  request: PurchaseRequest,
): PolicyDecision {
  if (request.totalMinor <= 0) {
    return {
      outcome: "refuse",
      code: "not_positive",
      reason: "An order has to cost something.",
      matchedScope: null,
    };
  }

  const policy = selectPolicy(policies, request);
  if (!policy) {
    return {
      outcome: "needs_approval",
      reason: "This household has not said what WonderHome may buy on its own.",
      matchedScope: "any",
    };
  }

  if (policy.currency !== request.currency) {
    // Comparing amounts across currencies without a rate is how a limit of
    // ₹2,000 quietly becomes a limit of $2,000.
    return {
      outcome: "refuse",
      code: "currency_mismatch",
      reason: `This household's limits are set in ${policy.currency}, and this order is in ${request.currency}.`,
      matchedScope: policy.scope,
    };
  }

  if (policy.hardLimitMinor !== null && request.totalMinor > policy.hardLimitMinor) {
    return {
      outcome: "refuse",
      code: "over_hard_limit",
      reason: `This is above the household's ceiling of ${format(policy.hardLimitMinor, policy.currency)}.`,
      matchedScope: policy.scope,
    };
  }

  if (policy.autoApproveUnderMinor !== null && request.totalMinor <= policy.autoApproveUnderMinor) {
    return {
      outcome: "allow",
      reason: `Under the household's ${format(policy.autoApproveUnderMinor, policy.currency)} limit.`,
      matchedScope: policy.scope,
    };
  }

  return {
    outcome: "needs_approval",
    reason:
      policy.autoApproveUnderMinor === null
        ? "This household approves every purchase."
        : `Above the household's ${format(policy.autoApproveUnderMinor, policy.currency)} limit.`,
    matchedScope: policy.scope,
  };
}

/** Minor units as a household reads them. */
export function format(minor: number, currency: string): string {
  const major = (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === "INR" ? `₹${major}` : `${currency} ${major}`;
}

/**
 * What the household is shown before anything is bought (09-002, 09-004).
 *
 * The criterion is that the action shows expected cost and quantity "before any
 * purchase side effect occurs", so this is deliberately a pure description of a
 * request that has not happened.
 */
export function describePurchase(request: PurchaseRequest, decision: PolicyDecision): string {
  const amount = format(request.totalMinor, request.currency);

  switch (decision.outcome) {
    case "allow":
      return `${amount} from ${request.merchant}. ${decision.reason}`;
    case "needs_approval":
      return `${amount} from ${request.merchant} — needs your approval. ${decision.reason}`;
    case "refuse":
      return `${amount} from ${request.merchant} will not go through. ${decision.reason}`;
  }
}
