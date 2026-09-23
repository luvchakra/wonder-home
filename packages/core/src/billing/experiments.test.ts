import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { PlanFeature } from "./entitlements";
import { applyExperiments, experimentBucket, experimentProblem, moveExperiment, variantFor, type ExperimentTerms } from "./experiments";
import { consume, may } from "./repository";

vi.mock("../db/admin", () => ({ createAdminClient: () => { throw new Error("tests pass their own meter"); } }));

const experiment = (over: Partial<ExperimentTerms> = {}): ExperimentTerms => ({
  key: "voice_on_free",
  featureKey: "conversation.voice",
  planKeys: ["free"],
  treatmentPercent: 50,
  treatmentEnabled: true,
  treatmentLimit: 20,
  treatmentPeriod: "month",
  ...over,
});

const plan: PlanFeature[] = [
  { featureKey: "conversation.text", enabled: true, limitPerPeriod: 200, period: "month" },
  { featureKey: "ai.agent_runs", enabled: true, limitPerPeriod: 20, period: "month", burstLimit: 5, burstWindowSeconds: 60, fairUseLimit: 15 },
];

/** Household ids that land on each side of a 50% split, found rather than assumed. */
function householdsOn(variant: "treatment" | "control", terms = experiment(), count = 3): string[] {
  const found: string[] = [];
  for (let index = 0; found.length < count; index += 1) {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    if (variantFor(terms, id) === variant) found.push(id);
  }
  return found;
}

describe("who is in an experiment (story 20-008)", () => {
  it("puts a household in a stable bucket from 0 to 99", () => {
    const bucket = experimentBucket("voice_on_free", "h-1");
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(100);
    expect(experimentBucket("voice_on_free", "h-1")).toBe(bucket);
    // A different experiment is an independent draw, not the same split again.
    const ids = Array.from({ length: 200 }, (_, index) => `h-${index}`);
    const same = ids.filter((id) => experimentBucket("voice_on_free", id) === experimentBucket("other_trial", id)).length;
    expect(same).toBeLessThan(20);
  });

  it("splits roughly by the treatment share, and raising the share only ever adds households", () => {
    const ids = Array.from({ length: 2000 }, (_, index) => `household-${index}`);
    const at = (percent: number) => new Set(ids.filter((id) => variantFor(experiment({ treatmentPercent: percent }), id) === "treatment"));
    const ten = at(10);
    const thirty = at(30);
    expect(ten.size).toBeGreaterThan(120);
    expect(ten.size).toBeLessThan(280);
    expect([...ten].every((id) => thirty.has(id))).toBe(true);
    expect(at(100).size).toBe(ids.length);
  });
});

describe("applying experiments to a plan", () => {
  it("gives the treatment group the experiment's terms, tagged as a trial, and leaves the control group on the plan as sold", () => {
    const [treated] = householdsOn("treatment");
    const [control] = householdsOn("control");

    const withTrial = applyExperiments("free", plan, [experiment()], treated!);
    expect(withTrial.find((feature) => feature.featureKey === "conversation.voice")).toEqual({
      featureKey: "conversation.voice",
      enabled: true,
      limitPerPeriod: 20,
      period: "month",
      experimentKey: "voice_on_free",
    });

    expect(applyExperiments("free", plan, [experiment()], control!)).toEqual(plan);
  });

  it("ignores an experiment on another plan", () => {
    const [treated] = householdsOn("treatment");
    expect(applyExperiments("pro", plan, [experiment()], treated!)).toEqual(plan);
  });

  it("can take a feature away, or change its allowance, while the plan's abuse throttles still hold", () => {
    const terms = experiment({ key: "fewer_runs", featureKey: "ai.agent_runs", treatmentLimit: 10, treatmentPercent: 100 });
    const [feature] = applyExperiments("free", plan, [terms], "any").filter((entry) => entry.featureKey === "ai.agent_runs");
    // The fair-use level of 15 no longer fits under an allowance of 10, so it goes; the burst stays.
    expect(feature).toMatchObject({ limitPerPeriod: 10, burstLimit: 5, burstWindowSeconds: 60, fairUseLimit: null, experimentKey: "fewer_runs" });

    const off = applyExperiments("free", plan, [experiment({ key: "no_text", featureKey: "conversation.text", treatmentEnabled: false, treatmentPercent: 100 })], "any");
    expect(off.find((entry) => entry.featureKey === "conversation.text")).toMatchObject({ enabled: false, experimentKey: "no_text" });
  });

  it("settles two experiments on one feature by key, never by row order", () => {
    const a = experiment({ key: "a_first", treatmentPercent: 100, treatmentLimit: 5 });
    const b = experiment({ key: "b_second", treatmentPercent: 100, treatmentLimit: 50 });
    const pick = (list: ExperimentTerms[]) => applyExperiments("free", plan, list, "any").find((entry) => entry.featureKey === "conversation.voice");
    expect(pick([a, b])).toMatchObject({ limitPerPeriod: 5, experimentKey: "a_first" });
    expect(pick([b, a])).toMatchObject({ limitPerPeriod: 5, experimentKey: "a_first" });
  });
});

/** A member's session: the plan, and whichever experiments are running. */
function memberClient(experiments: Record<string, unknown>[], options: { experimentsFail?: boolean } = {}): SupabaseClient {
  const rows: Record<string, Record<string, unknown>[]> = {
    household_subscriptions: [],
    plan_features: [{ feature_key: "conversation.text", enabled: true, limit_per_period: 200, period: "month" }],
    entitlement_experiments: experiments,
    usage_counters: [],
  };
  return {
    from(table: string) {
      const result = options.experimentsFail && table === "entitlement_experiments" ? { data: null, error: { code: "42501" } } : { data: rows[table] ?? [], error: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        contains: () => chain,
        maybeSingle: async () => ({ data: result.data?.[0] ?? null, error: result.error }),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const runningRow = {
  key: "voice_on_free",
  feature_key: "conversation.voice",
  plan_keys: ["free"],
  treatment_percent: 50,
  treatment_enabled: true,
  treatment_limit: null,
  treatment_period: "month",
};

describe("the one entitlement service decides, whatever the screen shows", () => {
  it("refuses a feature to the control group on a direct call, and allows it to the treatment group", async () => {
    const [treated] = householdsOn("treatment");
    const [control] = householdsOn("control");
    const meter = { rpc: vi.fn(async () => ({ data: [{ used: 1, allowed: true }], error: null })) } as unknown as Pick<SupabaseClient, "rpc">;

    await expect(may(memberClient([runningRow]), control!, "conversation.voice")).resolves.toMatchObject({ allowed: false, code: "not_in_plan" });
    await expect(consume(memberClient([runningRow]), control!, "conversation.voice", { meter })).resolves.toMatchObject({ allowed: false, code: "not_in_plan" });
    await expect(may(memberClient([runningRow]), treated!, "conversation.voice")).resolves.toMatchObject({ allowed: true });
    await expect(consume(memberClient([runningRow]), treated!, "conversation.voice", { meter })).resolves.toMatchObject({ allowed: true });
  });

  it("falls back to the plan as sold when experiments cannot be read", async () => {
    const [treated] = householdsOn("treatment");
    await expect(may(memberClient([runningRow], { experimentsFail: true }), treated!, "conversation.voice")).resolves.toMatchObject({ allowed: false });
    await expect(may(memberClient([runningRow], { experimentsFail: true }), treated!, "conversation.text")).resolves.toMatchObject({ allowed: true });
  });
});

describe("staff drafts, starts and stops experiments", () => {
  const draft = {
    key: "voice_on_free",
    featureKey: "conversation.voice",
    description: "Does voice on Free bring households back?",
    planKeys: ["free"],
    treatmentPercent: 10,
    treatmentEnabled: true,
    treatmentLimit: 20,
    treatmentPeriod: "month" as const,
  };

  it("says in words why a draft is not coherent", () => {
    expect(experimentProblem(draft, ["free", "pro"])).toBeNull();
    expect(experimentProblem({ ...draft, planKeys: ["gold"] }, ["free"])).toMatch(/no plan called gold/);
    expect(experimentProblem({ ...draft, treatmentPercent: 0 }, ["free"])).toMatch(/1 to 100/);
    expect(experimentProblem({ ...draft, description: "short" }, ["free"])).toMatch(/Say what is being tried/);
    expect(experimentProblem({ ...draft, key: "Bad Key" }, ["free"])).toMatch(/lower case/);
  });

  function staffClient(status: string | null) {
    const writes: { table: string; value: unknown }[] = [];
    const row = status ? { ...runningRow, description: draft.description, status, started_at: null, stopped_at: null } : null;
    return {
      writes,
      client: {
        from(table: string) {
          const chain = {
            select: () => chain,
            eq: () => chain,
            update: (value: unknown) => (writes.push({ table, value }), chain),
            insert: async (value: unknown) => (writes.push({ table, value }), { error: null }),
            maybeSingle: async () => ({ data: row, error: null }),
            then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
          };
          return chain;
        },
      } as unknown as SupabaseClient,
    };
  }

  it("starts a draft and keeps who, when and why", async () => {
    const { client, writes } = staffClient("draft");
    await moveExperiment(client, { key: "voice_on_free", to: "running", actorProfileId: "staff-1", reasonCode: "feature_trial" }, new Date("2026-09-24T10:00:00Z"));
    expect(writes).toEqual([
      { table: "entitlement_experiments", value: { status: "running", started_at: "2026-09-24T10:00:00.000Z" } },
      { table: "entitlement_experiment_events", value: { experiment_key: "voice_on_free", action: "started", actor_profile_id: "staff-1", reason_code: "feature_trial" } },
    ]);
  });

  it("never restarts a stopped experiment or stops a draft", async () => {
    await expect(moveExperiment(staffClient("stopped").client, { key: "voice_on_free", to: "running", actorProfileId: "s", reasonCode: "feature_trial" })).rejects.toMatchObject({ code: "conflict" });
    await expect(moveExperiment(staffClient("draft").client, { key: "voice_on_free", to: "stopped", actorProfileId: "s", reasonCode: "experiment_complete" })).rejects.toMatchObject({ code: "conflict" });
    await expect(moveExperiment(staffClient(null).client, { key: "nope", to: "running", actorProfileId: "s", reasonCode: "feature_trial" })).rejects.toMatchObject({ code: "not_found" });
  });
});
