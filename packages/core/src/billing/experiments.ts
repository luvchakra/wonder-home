import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { log } from "../observability/logger";
import { describe, periodStart, type PlanFeature } from "./entitlements";

/**
 * Controlled entitlement experiments (story 20-008).
 *
 * An experiment changes one plan feature for a share of the households on
 * the plans it names: it turns a feature on, turns it off, or gives it a
 * different allowance. The plan itself is not touched.
 *
 * Which side a household is on is a pure function of the experiment key
 * and the household id: a stable hash, compared against
 * `treatment_percent`. So:
 *   - the same household always lands on the same side;
 *   - raising the share only ever adds households, never swaps them;
 *   - the split can be recomputed afterwards from the frozen terms, with no
 *     per-household row to keep.
 *
 * The overlay is applied inside `loadSubscription`, so `may`, `consume` and
 * everything built on them see the same features. A direct API call cannot
 * reach a feature the screen hides, or miss one the screen shows.
 */

export const EXPERIMENT_REASON_CODES = [
  "pricing_research",
  "feature_trial",
  "capacity_test",
  "experiment_complete",
  "experiment_harm",
] as const;

export type ExperimentReasonCode = (typeof EXPERIMENT_REASON_CODES)[number];

export type ExperimentTerms = {
  key: string;
  featureKey: string;
  planKeys: readonly string[];
  treatmentPercent: number;
  treatmentEnabled: boolean;
  /** Null is unlimited. */
  treatmentLimit: number | null;
  treatmentPeriod: PlanFeature["period"];
};

export type Variant = "treatment" | "control";

/**
 * 0–99, stable for an experiment and a household. FNV-1a over the two keys,
 * then murmur3's finaliser:
 * deterministic in every runtime, with no dependency, and spread well
 * enough for a percentage split. It is not a secret. Knowing your bucket
 * gains a household nothing the entitlement service would not already say.
 */
export function experimentBucket(experimentKey: string, householdId: string): number {
  let hash = 0x811c9dc5;
  const input = `${experimentKey}:${householdId}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // FNV's multiply only carries upward, so its low bits barely mix and two
  // experiments would split households almost the same way. murmur3's
  // finaliser spreads every input bit across the result.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) % 100;
}

export function variantFor(experiment: Pick<ExperimentTerms, "key" | "treatmentPercent">, householdId: string): Variant {
  return experimentBucket(experiment.key, householdId) < experiment.treatmentPercent ? "treatment" : "control";
}

/**
 * A plan's features as one household meets them, with every running
 * experiment it is in the treatment of applied. The control group gets the
 * plan exactly as it is. Two experiments on one feature: the first by key
 * wins, so the answer never depends on the order the rows came back in.
 */
export function applyExperiments(
  planKey: string,
  features: readonly PlanFeature[],
  experiments: readonly ExperimentTerms[],
  householdId: string,
): PlanFeature[] {
  const result = features.map((feature) => ({ ...feature }));
  const taken = new Set<string>();
  for (const experiment of [...experiments].sort((a, b) => a.key.localeCompare(b.key))) {
    if (!experiment.planKeys.includes(planKey) || taken.has(experiment.featureKey)) continue;
    if (variantFor(experiment, householdId) !== "treatment") continue;
    taken.add(experiment.featureKey);

    const override: PlanFeature = {
      featureKey: experiment.featureKey,
      enabled: experiment.treatmentEnabled,
      limitPerPeriod: experiment.treatmentLimit,
      period: experiment.treatmentPeriod,
      experimentKey: experiment.key,
    };
    const index = result.findIndex((feature) => feature.featureKey === experiment.featureKey);
    if (index === -1) {
      result.push(override);
    } else {
      // The plan's own burst and fair-use policies still hold. An experiment
      // changes what is allowed, not how abuse is throttled.
      const existing = result[index]!;
      result[index] = {
        ...override,
        burstLimit: existing.burstLimit ?? null,
        burstWindowSeconds: existing.burstWindowSeconds ?? null,
        fairUseLimit:
          existing.fairUseLimit != null && (override.limitPerPeriod === null || existing.fairUseLimit <= override.limitPerPeriod)
            ? existing.fairUseLimit
            : null,
      };
    }
  }
  return result;
}

type Row = Record<string, unknown>;

const TERM_COLUMNS = "key, feature_key, plan_keys, treatment_percent, treatment_enabled, treatment_limit, treatment_period";

function termsFromRow(row: Row): ExperimentTerms {
  return {
    key: row.key as string,
    featureKey: row.feature_key as string,
    planKeys: (row.plan_keys as string[] | null) ?? [],
    treatmentPercent: Number(row.treatment_percent),
    treatmentEnabled: row.treatment_enabled === true,
    treatmentLimit: row.treatment_limit === null || row.treatment_limit === undefined ? null : Number(row.treatment_limit),
    treatmentPeriod: row.treatment_period as PlanFeature["period"],
  };
}

/**
 * The running experiments that touch a plan, read through whatever client
 * reads the plan: a member's own session may read only these columns.
 *
 * Unreadable means none. The household then gets its plan exactly as sold,
 * which is the answer it would have had with no experiment at all.
 */
export async function runningExperiments(supabase: SupabaseClient, planKey: string): Promise<ExperimentTerms[]> {
  try {
    const { data, error } = await supabase
      .from("entitlement_experiments")
      .select(TERM_COLUMNS)
      .eq("status", "running")
      .contains("plan_keys", [planKey]);
    if (error) throw error;
    return ((data ?? []) as Row[]).map(termsFromRow);
  } catch (thrown) {
    log.warn("experiments unavailable; using the plan as sold", { reason: (thrown as { code?: string } | null)?.code ?? "unknown" });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Staff: creating, starting, stopping and reading experiments.
// ---------------------------------------------------------------------------

export type ExperimentDraft = Omit<ExperimentTerms, "planKeys"> & { planKeys: string[]; description: string };

export type ExperimentSummary = ExperimentTerms & {
  description: string;
  status: "draft" | "running" | "stopped";
  startedAt: string | null;
  stoppedAt: string | null;
  /**
   * Counts only: households per group, and what they used of the feature
   * this period. Never anything a household said or did beyond a counter.
   */
  results: Record<Variant, { households: number; used: number }> | null;
};

async function recordEvent(admin: SupabaseClient, key: string, action: "created" | "started" | "stopped", actorProfileId: string, reasonCode: ExperimentReasonCode) {
  const { error } = await admin
    .from("entitlement_experiment_events")
    .insert({ experiment_key: key, action, actor_profile_id: actorProfileId, reason_code: reasonCode });
  if (error) throw new Error(`experiment event failed: ${error.code ?? "unknown"}`);
}

/** Whether a draft is coherent, in words. The database checks the same shape. */
export function experimentProblem(draft: ExperimentDraft, knownPlans: readonly string[]): string | null {
  if (!/^[a-z][a-z0-9_]{2,60}$/.test(draft.key)) return "An experiment key is lower case letters, digits and underscores.";
  if (!/^[a-z][a-z0-9_.]{1,60}$/.test(draft.featureKey)) return "That is not a feature key.";
  if (draft.planKeys.length === 0) return "Name at least one plan whose households take part.";
  const unknown = draft.planKeys.filter((plan) => !knownPlans.includes(plan));
  if (unknown.length > 0) return `There is no plan called ${unknown.join(", ")}.`;
  if (!Number.isInteger(draft.treatmentPercent) || draft.treatmentPercent < 1 || draft.treatmentPercent > 100) {
    return "The treatment share is a whole percentage from 1 to 100.";
  }
  if (draft.treatmentLimit !== null && (!Number.isInteger(draft.treatmentLimit) || draft.treatmentLimit < 0)) {
    return "An allowance is a whole number, zero or more.";
  }
  if (draft.description.trim().length < 10) return "Say what is being tried, so someone reviewing this later understands it.";
  return null;
}

export async function createExperiment(
  admin: SupabaseClient,
  input: { actorProfileId: string; reasonCode: ExperimentReasonCode; draft: ExperimentDraft },
): Promise<ExperimentSummary> {
  const { data: plans, error: planError } = await admin.from("plans").select("key");
  if (planError) throw new Error(`createExperiment failed: ${planError.code ?? "unknown"}`);
  const problem = experimentProblem(input.draft, ((plans ?? []) as Row[]).map((row) => row.key as string));
  if (problem) throw new ApiError("unprocessable", problem);

  const { draft } = input;
  const { error } = await admin.from("entitlement_experiments").insert({
    key: draft.key,
    feature_key: draft.featureKey,
    description: draft.description.trim(),
    plan_keys: draft.planKeys,
    treatment_percent: draft.treatmentPercent,
    treatment_enabled: draft.treatmentEnabled,
    treatment_limit: draft.treatmentLimit,
    treatment_period: draft.treatmentPeriod,
    created_by_profile_id: input.actorProfileId,
  });
  if (error) {
    if (error.code === "23505") throw ApiError.conflict("An experiment with that key already exists.");
    if (error.code === "23514") throw new ApiError("unprocessable", "That experiment is not coherent.");
    throw new Error(`createExperiment failed: ${error.code ?? "unknown"}`);
  }
  await recordEvent(admin, draft.key, "created", input.actorProfileId, input.reasonCode);
  return (await readExperiment(admin, draft.key))!;
}

/**
 * Starts a draft, or stops a running experiment. Nothing else ever changes
 * about an experiment: its terms are frozen from the moment it starts, by
 * the database as well as here.
 */
export async function moveExperiment(
  admin: SupabaseClient,
  input: { key: string; to: "running" | "stopped"; actorProfileId: string; reasonCode: ExperimentReasonCode },
  now: Date = new Date(),
): Promise<ExperimentSummary> {
  const current = await readExperiment(admin, input.key);
  if (!current) throw ApiError.notFound("There is no such experiment.");
  const from = current.status;
  if (!((from === "draft" && input.to === "running") || (from === "running" && input.to === "stopped"))) {
    throw ApiError.conflict(
      from === "stopped" ? "That experiment has already stopped." : input.to === "running" ? "That experiment is already running." : "Only a running experiment can be stopped.",
    );
  }

  const { error } = await admin
    .from("entitlement_experiments")
    .update(input.to === "running" ? { status: "running", started_at: now.toISOString() } : { status: "stopped", stopped_at: now.toISOString() })
    .eq("key", input.key)
    .eq("status", from);
  if (error) throw new Error(`moveExperiment failed: ${error.code ?? "unknown"}`);
  await recordEvent(admin, input.key, input.to === "running" ? "started" : "stopped", input.actorProfileId, input.reasonCode);
  return (await readExperiment(admin, input.key))!;
}

async function readExperiment(admin: SupabaseClient, key: string): Promise<ExperimentSummary | null> {
  const { data, error } = await admin
    .from("entitlement_experiments")
    .select(`${TERM_COLUMNS}, description, status, started_at, stopped_at`)
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`readExperiment failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  return summaryFromRow(data as Row, null);
}

function summaryFromRow(row: Row, results: ExperimentSummary["results"]): ExperimentSummary {
  return {
    ...termsFromRow(row),
    description: row.description as string,
    status: row.status as ExperimentSummary["status"],
    startedAt: (row.started_at as string | null) ?? null,
    stoppedAt: (row.stopped_at as string | null) ?? null,
    results,
  };
}

/**
 * Every experiment, newest first, with the split and what each group used
 * of the feature this period for any that has started. Recomputed from the
 * frozen terms each time; counts only.
 */
export async function listExperiments(admin: SupabaseClient, now: Date = new Date()): Promise<ExperimentSummary[]> {
  const { data, error } = await admin
    .from("entitlement_experiments")
    .select(`${TERM_COLUMNS}, description, status, started_at, stopped_at, created_at`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listExperiments failed: ${error.code ?? "unknown"}`);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const started = rows.filter((row) => row.status !== "draft");
  let households: { id: string; planKey: string }[] = [];
  if (started.length > 0) {
    const [{ data: all, error: householdError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
      admin.from("households").select("id"),
      admin.from("household_subscriptions").select("household_id, plan_key"),
    ]);
    if (householdError || subscriptionError) throw new Error("listExperiments failed to read households");
    const planOf = new Map(((subscriptions ?? []) as Row[]).map((row) => [row.household_id as string, row.plan_key as string]));
    households = ((all ?? []) as Row[]).map((row) => ({ id: row.id as string, planKey: planOf.get(row.id as string) ?? "free" }));
  }

  const summaries: ExperimentSummary[] = [];
  for (const row of rows) {
    if (row.status === "draft") {
      summaries.push(summaryFromRow(row, null));
      continue;
    }
    const terms = termsFromRow(row);
    const taking = households.filter((household) => terms.planKeys.includes(household.planKey));
    const results: NonNullable<ExperimentSummary["results"]> = { treatment: { households: 0, used: 0 }, control: { households: 0, used: 0 } };
    const variantOf = new Map<string, Variant>();
    for (const household of taking) {
      const variant = variantFor(terms, household.id);
      variantOf.set(household.id, variant);
      results[variant].households += 1;
    }
    if (taking.length > 0) {
      const { data: usage, error: usageError } = await admin
        .from("usage_counters")
        .select("household_id, used")
        .eq("feature_key", terms.featureKey)
        .eq("period_start", periodStart(terms.treatmentPeriod, now).toISOString());
      if (usageError) throw new Error(`listExperiments failed to read usage: ${usageError.code ?? "unknown"}`);
      for (const counter of (usage ?? []) as Row[]) {
        const variant = variantOf.get(counter.household_id as string);
        if (variant) results[variant].used += Number(counter.used ?? 0);
      }
    }
    summaries.push(summaryFromRow(row, results));
  }
  return summaries;
}

/** One line a household can read about a trial it is part of. */
export function describeTrial(featureKey: string): string {
  return `${describe(featureKey)} is part of a trial WonderHome is running on your plan. When the trial ends it returns to your plan as sold, and nothing you made is removed.`;
}
