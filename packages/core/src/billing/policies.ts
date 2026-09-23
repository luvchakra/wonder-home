import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { describe, type PlanFeature } from "./entitlements";

/**
 * Fair-use and burst policies (story 20-007).
 *
 * Two more things a plan feature can say, both plan data rather than code:
 *
 *   - A **burst** policy: at most N uses per W-second window. It stops the
 *     spike a script or a stuck client makes, and it is temporary by nature —
 *     the refusal says so and nothing is lost. Windows are fixed (aligned to
 *     the clock, like every rate limit here), so a spike that straddles two
 *     windows can reach up to twice N across the boundary; that is the
 *     accepted cost of one atomic counter per window.
 *   - A **fair-use** level: past N uses in the period the household is not
 *     refused, it is served more cheaply. For HomeTalk that means answering
 *     from WonderHome's own rules rather than a model, and saying so.
 *
 * A hard allowance (`limit_per_period`) is still the only thing that ever
 * refuses for the rest of a period. No domain module knows any of these
 * numbers; they are read by the one entitlement service (`consume`).
 */

export const POLICY_REASON_CODES = [
  "abuse_response",
  "cost_control",
  "plan_launch",
  "plan_correction",
  "capacity_protection",
] as const;

export type PolicyReasonCode = (typeof POLICY_REASON_CODES)[number];

export type FeaturePolicy = {
  burstLimit: number | null;
  burstWindowSeconds: number | null;
  fairUseLimit: number | null;
};

/** The shortest and longest burst window a policy may name, matching the database's own check. */
export const BURST_WINDOW_BOUNDS = { min: 10, max: 86_400 } as const;

/** Where a household stands against its fair-use level. `null` when the feature has none. */
export function fairUseState(entry: Pick<PlanFeature, "fairUseLimit">, used: number): "within" | "over" | null {
  const limit = entry.fairUseLimit ?? null;
  if (limit === null) return null;
  return used > limit ? "over" : "within";
}

/** Whether a feature needs its uses counted even when it has no hard allowance. */
export function needsCounting(entry: Pick<PlanFeature, "limitPerPeriod" | "fairUseLimit">): boolean {
  return entry.limitPerPeriod !== null || (entry.fairUseLimit ?? null) !== null;
}

/** The rate-limit bucket a feature's burst policy is counted in, per household. */
export function burstBucket(featureKey: string): string {
  return `plan.burst.${featureKey}`;
}

export const BURST_MESSAGE =
  "That is a lot in a short time, so WonderHome is pausing this for a moment. Nothing was lost — try again shortly.";

/** What a household is told when a turn was answered by the rules because it is past its fair-use level. */
export const FAIR_USE_DISCLOSURE =
  "This household has used a lot of AI this period, so this turn was answered from WonderHome's own rules. Nothing was sent to a model.";

/**
 * Whether a proposed policy is coherent for this feature, as a reason a
 * person can read. The database checks the same things; this says them in
 * words before a write is ever tried.
 */
export function policyProblem(policy: FeaturePolicy, entry: Pick<PlanFeature, "limitPerPeriod" | "period">): string | null {
  const { burstLimit, burstWindowSeconds, fairUseLimit } = policy;
  if ((burstLimit === null) !== (burstWindowSeconds === null)) {
    return "A burst policy needs both a limit and a window, or neither.";
  }
  if (burstLimit !== null && (!Number.isInteger(burstLimit) || burstLimit <= 0)) {
    return "A burst limit is a whole number above zero.";
  }
  if (
    burstWindowSeconds !== null &&
    (!Number.isInteger(burstWindowSeconds) || burstWindowSeconds < BURST_WINDOW_BOUNDS.min || burstWindowSeconds > BURST_WINDOW_BOUNDS.max)
  ) {
    return `A burst window is between ${BURST_WINDOW_BOUNDS.min} seconds and a day.`;
  }
  if (fairUseLimit !== null && (!Number.isInteger(fairUseLimit) || fairUseLimit <= 0)) {
    return "A fair-use level is a whole number above zero.";
  }
  // A "forever" feature never resets, so a fair-use level on it would turn a
  // household's heavy month into a lifetime of simpler answers.
  if (fairUseLimit !== null && entry.period === "forever") {
    return "A fair-use level needs a period that resets; this feature is counted forever.";
  }
  if (fairUseLimit !== null && entry.limitPerPeriod !== null && fairUseLimit > entry.limitPerPeriod) {
    return "A fair-use level cannot be above the feature's own allowance — the allowance would refuse first.";
  }
  return null;
}

/** One sentence per policy, for staff and for the household's usage screen. */
export function describePolicy(entry: Pick<PlanFeature, "featureKey" | "period"> & Partial<FeaturePolicy>): string[] {
  const lines: string[] = [];
  const label = describe(entry.featureKey);
  if (entry.burstLimit && entry.burstWindowSeconds) {
    lines.push(`${label}: at most ${entry.burstLimit} per ${windowWords(entry.burstWindowSeconds)}.`);
  }
  if (entry.fairUseLimit) {
    lines.push(`${label}: past ${entry.fairUseLimit} ${periodWords(entry.period)}, answered more simply rather than refused.`);
  }
  return lines;
}

function windowWords(seconds: number): string {
  if (seconds % 3600 === 0) return seconds === 3600 ? "hour" : `${seconds / 3600} hours`;
  if (seconds % 60 === 0) return seconds === 60 ? "minute" : `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

function periodWords(period: PlanFeature["period"]): string {
  return period === "forever" ? "in all" : `a ${period}`;
}

export type PlanPolicyRow = { featureKey: string; label: string; enabled: boolean; limitPerPeriod: number | null; period: PlanFeature["period"] } & FeaturePolicy;

/** Every feature of a plan with its policies, for staff. Read through the service-role client. */
export async function planPolicies(admin: SupabaseClient, planKey: string): Promise<PlanPolicyRow[]> {
  const { data, error } = await admin
    .from("plan_features")
    .select("feature_key, enabled, limit_per_period, period, burst_limit, burst_window_seconds, fair_use_limit")
    .eq("plan_key", planKey)
    .order("feature_key");
  if (error) throw new Error(`planPolicies failed: ${error.code ?? "unknown"}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) throw ApiError.notFound("There is no such plan.");
  return rows.map(policyRow);
}

function policyRow(row: Record<string, unknown>): PlanPolicyRow {
  return {
    featureKey: row.feature_key as string,
    label: describe(row.feature_key as string),
    enabled: row.enabled === true,
    limitPerPeriod: nullableNumber(row.limit_per_period),
    period: row.period as PlanFeature["period"],
    burstLimit: nullableNumber(row.burst_limit),
    burstWindowSeconds: nullableNumber(row.burst_window_seconds),
    fairUseLimit: nullableNumber(row.fair_use_limit),
  };
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/**
 * Sets one plan feature's burst and fair-use policy, and keeps the change.
 *
 * Platform staff only (the caller checks `subscription.manage`), through the
 * service-role client. The previous and new policy go into the append-only
 * `plan_policy_events` with who, when and a reason code — never free text,
 * which the audit trail would only redact. Changing a policy touches no
 * household's records and no usage counter: what was counted stays counted.
 */
export async function setFeaturePolicy(
  admin: SupabaseClient,
  input: { planKey: string; featureKey: string; actorProfileId: string; reasonCode: PolicyReasonCode; policy: FeaturePolicy },
): Promise<{ before: FeaturePolicy; after: PlanPolicyRow; changed: boolean }> {
  const { data: current, error: readError } = await admin
    .from("plan_features")
    .select("feature_key, enabled, limit_per_period, period, burst_limit, burst_window_seconds, fair_use_limit")
    .eq("plan_key", input.planKey)
    .eq("feature_key", input.featureKey)
    .maybeSingle();
  if (readError) throw new Error(`setFeaturePolicy failed: ${readError.code ?? "unknown"}`);
  if (!current) throw ApiError.notFound("That plan has no such feature.");

  const existing = policyRow(current as Record<string, unknown>);
  const problem = policyProblem(input.policy, existing);
  if (problem) throw new ApiError("unprocessable", problem);

  const before: FeaturePolicy = {
    burstLimit: existing.burstLimit,
    burstWindowSeconds: existing.burstWindowSeconds,
    fairUseLimit: existing.fairUseLimit,
  };
  const changed =
    before.burstLimit !== input.policy.burstLimit ||
    before.burstWindowSeconds !== input.policy.burstWindowSeconds ||
    before.fairUseLimit !== input.policy.fairUseLimit;
  // Setting what is already set is not a change, and leaves no event.
  if (!changed) return { before, after: existing, changed: false };

  const { data: updated, error: writeError } = await admin
    .from("plan_features")
    .update({
      burst_limit: input.policy.burstLimit,
      burst_window_seconds: input.policy.burstWindowSeconds,
      fair_use_limit: input.policy.fairUseLimit,
    })
    .eq("plan_key", input.planKey)
    .eq("feature_key", input.featureKey)
    .select("feature_key, enabled, limit_per_period, period, burst_limit, burst_window_seconds, fair_use_limit")
    .single();
  if (writeError) {
    if (writeError.code === "23514") throw new ApiError("unprocessable", "That policy is not coherent for this feature.");
    throw new Error(`setFeaturePolicy failed: ${writeError.code ?? "unknown"}`);
  }

  const { error: eventError } = await admin.from("plan_policy_events").insert({
    plan_key: input.planKey,
    feature_key: input.featureKey,
    actor_profile_id: input.actorProfileId,
    reason_code: input.reasonCode,
    before,
    after: input.policy,
  });
  if (eventError) throw new Error(`setFeaturePolicy failed to record: ${eventError.code ?? "unknown"}`);

  return { before, after: policyRow(updated as Record<string, unknown>), changed: true };
}

/** The recorded changes to one plan's policies, newest first. */
export async function policyHistory(admin: SupabaseClient, planKey: string, limit = 50) {
  const { data, error } = await admin
    .from("plan_policy_events")
    .select("id, feature_key, actor_profile_id, reason_code, before, after, created_at")
    .eq("plan_key", planKey)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`policyHistory failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    featureKey: row.feature_key as string,
    actorProfileId: (row.actor_profile_id as string | null) ?? null,
    reasonCode: row.reason_code as string,
    before: row.before as FeaturePolicy,
    after: row.after as FeaturePolicy,
    createdAt: row.created_at as string,
  }));
}
