import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { describePolicy, fairUseState, needsCounting, policyProblem, burstBucket, setFeaturePolicy } from "./policies";
import { consume } from "./repository";

vi.mock("../db/admin", () => ({ createAdminClient: () => { throw new Error("tests pass their own meter"); } }));

/** A household's subscription and plan, read through a member client that only ever reads. */
function memberClient(features: Record<string, unknown>[]): SupabaseClient {
  const rows: Record<string, Record<string, unknown>[]> = {
    household_subscriptions: [{ plan_key: "family", status: "active", current_period_start: "2026-09-01T00:00:00Z" }],
    plan_features: features,
  };
  return {
    from(table: string) {
      const result = { data: rows[table] ?? [], error: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        contains: () => chain,
        maybeSingle: async () => ({ data: result.data[0] ?? null, error: null }),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

function feature(over: Record<string, unknown> = {}) {
  return {
    feature_key: "conversation.text",
    enabled: true,
    limit_per_period: null,
    period: "month",
    burst_limit: null,
    burst_window_seconds: null,
    fair_use_limit: null,
    ...over,
  };
}

/** The server's meter: `record_usage` counts, `rate_limit_hit` answers the burst window. */
function meter(options: { used?: number; burstAllows?: boolean; burstFails?: boolean } = {}) {
  let used = options.used ?? 0;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    calls,
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "rate_limit_hit") {
        if (options.burstFails) return { data: null, error: { code: "PGRST202" } };
        return { data: options.burstAllows ?? true, error: null };
      }
      used += Number(args.p_amount);
      const limit = args.p_limit as number | null;
      return { data: [{ used, allowed: limit === null || used <= limit }], error: null };
    }),
  };
  return client as typeof client & Pick<SupabaseClient, "rpc">;
}

describe("fair-use and burst policies, as plan data (story 20-007)", () => {
  it("places a household against its fair-use level only when the plan names one", () => {
    expect(fairUseState({ fairUseLimit: null }, 10_000)).toBeNull();
    expect(fairUseState({ fairUseLimit: 400 }, 400)).toBe("within");
    expect(fairUseState({ fairUseLimit: 400 }, 401)).toBe("over");
  });

  it("counts a feature with only a fair-use level, and leaves a plain unlimited one alone", () => {
    expect(needsCounting({ limitPerPeriod: null, fairUseLimit: null })).toBe(false);
    expect(needsCounting({ limitPerPeriod: null, fairUseLimit: 400 })).toBe(true);
    expect(needsCounting({ limitPerPeriod: 20, fairUseLimit: null })).toBe(true);
  });

  it("names a burst bucket the rate-limit counters accept", () => {
    expect(burstBucket("conversation.text")).toMatch(/^[a-z][a-z0-9_.]{1,40}$/);
    expect(burstBucket("ai.autonomous_action")).toMatch(/^[a-z][a-z0-9_.]{1,40}$/);
  });

  it("says in words why an incoherent policy cannot be set", () => {
    const none = { burstLimit: null, burstWindowSeconds: null, fairUseLimit: null };
    expect(policyProblem(none, { limitPerPeriod: null, period: "month" })).toBeNull();
    expect(policyProblem({ ...none, burstLimit: 5 }, { limitPerPeriod: null, period: "month" })).toMatch(/both a limit and a window/);
    expect(policyProblem({ ...none, burstLimit: 5, burstWindowSeconds: 5 }, { limitPerPeriod: null, period: "month" })).toMatch(/between 10 seconds and a day/);
    expect(policyProblem({ ...none, burstLimit: 0, burstWindowSeconds: 60 }, { limitPerPeriod: null, period: "month" })).toMatch(/above zero/);
    expect(policyProblem({ ...none, fairUseLimit: 600 }, { limitPerPeriod: 500, period: "month" })).toMatch(/cannot be above/);
    expect(policyProblem({ burstLimit: 10, burstWindowSeconds: 60, fairUseLimit: 400 }, { limitPerPeriod: 500, period: "month" })).toBeNull();
    expect(policyProblem({ ...none, fairUseLimit: 400 }, { limitPerPeriod: null, period: "forever" })).toMatch(/period that resets/);
    // A burst window is its own clock, so a feature counted forever may still have one.
    expect(policyProblem({ ...none, burstLimit: 10, burstWindowSeconds: 60 }, { limitPerPeriod: null, period: "forever" })).toBeNull();
  });

  it("describes a policy as sentences a household can read", () => {
    expect(describePolicy({ featureKey: "conversation.text", period: "month", burstLimit: 10, burstWindowSeconds: 60, fairUseLimit: 400 })).toEqual([
      "Text conversation: at most 10 per minute.",
      "Text conversation: past 400 a month, answered more simply rather than refused.",
    ]);
    expect(describePolicy({ featureKey: "conversation.text", period: "month" })).toEqual([]);
  });
});

describe("consume applies the plan's policies", () => {
  it("changes nothing for a plan with no policies: an unlimited feature is not counted", async () => {
    const counter = meter();
    const decision = await consume(memberClient([feature()]), "h1", "conversation.text", { meter: counter });
    expect(decision).toMatchObject({ allowed: true, remaining: null });
    expect("fairUse" in decision).toBe(false);
    expect(counter.calls).toEqual([]);
  });

  it("refuses a burst for the window only, before anything is counted", async () => {
    const counter = meter({ burstAllows: false });
    const decision = await consume(
      memberClient([feature({ burst_limit: 5, burst_window_seconds: 60, limit_per_period: 500 })]),
      "h1",
      "conversation.text",
      { meter: counter },
    );
    expect(decision).toMatchObject({ allowed: false, code: "burst_limited" });
    expect(decision.reason).toMatch(/Nothing was lost/);
    expect(counter.calls.map((call) => call.name)).toEqual(["rate_limit_hit"]);
    expect(counter.calls[0]?.args).toMatchObject({ p_bucket: "plan.burst.conversation.text", p_subject: "h1", p_window_seconds: 60, p_max: 5 });
  });

  it("lets a use through when the burst counter cannot be reached — a throttle, not a gate", async () => {
    const counter = meter({ burstFails: true });
    const decision = await consume(memberClient([feature({ burst_limit: 5, burst_window_seconds: 60 })]), "h1", "conversation.text", { meter: counter });
    expect(decision.allowed).toBe(true);
  });

  it("counts an unlimited feature with a fair-use level, and says when the household is past it — never refusing", async () => {
    const within = await consume(memberClient([feature({ fair_use_limit: 3 })]), "h1", "conversation.text", { meter: meter({ used: 2 }) });
    expect(within).toMatchObject({ allowed: true, remaining: null, fairUse: "within" });

    const counter = meter({ used: 3 });
    const over = await consume(memberClient([feature({ fair_use_limit: 3 })]), "h1", "conversation.text", { meter: counter });
    expect(over).toMatchObject({ allowed: true, remaining: null, fairUse: "over" });
    // Null is unlimited: the fair-use level is never handed to the meter as a limit.
    expect(counter.calls[0]?.args.p_limit).toBeNull();
  });

  it("still refuses at the hard allowance, which is the only thing that refuses for the period", async () => {
    const decision = await consume(
      memberClient([feature({ limit_per_period: 5, fair_use_limit: 3 })]),
      "h1",
      "conversation.text",
      { meter: meter({ used: 5 }) },
    );
    expect(decision).toMatchObject({ allowed: false, code: "quota_exhausted" });
  });
});

describe("setting a policy keeps who, why, and before and after", () => {
  function staffClient(current: Record<string, unknown> | null) {
    const writes: { table: string; op: string; value: unknown }[] = [];
    const client = {
      from(table: string) {
        let op = "select";
        let value: unknown = null;
        const chain = {
          select: () => chain,
          eq: () => chain,
          update: (patch: unknown) => ((op = "update"), (value = patch), chain),
          insert: async (row: unknown) => (writes.push({ table, op: "insert", value: row }), { error: null }),
          maybeSingle: async () => ({ data: current, error: null }),
          single: async () => {
            writes.push({ table, op, value });
            return { data: { ...current, ...(value as object) }, error: null };
          },
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    return { client, writes };
  }

  const input = {
    planKey: "family",
    featureKey: "conversation.text",
    actorProfileId: "staff-1",
    reasonCode: "cost_control" as const,
    policy: { burstLimit: 10, burstWindowSeconds: 60, fairUseLimit: 400 },
  };

  it("writes the policy and one event with the before and after", async () => {
    const { client, writes } = staffClient(feature());
    const result = await setFeaturePolicy(client, input);
    expect(result.changed).toBe(true);
    expect(result.after).toMatchObject({ burstLimit: 10, burstWindowSeconds: 60, fairUseLimit: 400 });
    expect(writes).toEqual([
      { table: "plan_features", op: "update", value: { burst_limit: 10, burst_window_seconds: 60, fair_use_limit: 400 } },
      {
        table: "plan_policy_events",
        op: "insert",
        value: {
          plan_key: "family",
          feature_key: "conversation.text",
          actor_profile_id: "staff-1",
          reason_code: "cost_control",
          before: { burstLimit: null, burstWindowSeconds: null, fairUseLimit: null },
          after: input.policy,
        },
      },
    ]);
  });

  it("records nothing when the policy is already what was asked for", async () => {
    const { client, writes } = staffClient(feature({ burst_limit: 10, burst_window_seconds: 60, fair_use_limit: 400 }));
    const result = await setFeaturePolicy(client, input);
    expect(result.changed).toBe(false);
    expect(writes).toEqual([]);
  });

  it("refuses an incoherent policy before writing anything", async () => {
    const { client, writes } = staffClient(feature({ limit_per_period: 100 }));
    await expect(setFeaturePolicy(client, input)).rejects.toMatchObject({ code: "unprocessable" });
    expect(writes).toEqual([]);
  });

  it("says when the plan has no such feature", async () => {
    const { client } = staffClient(null);
    await expect(setFeaturePolicy(client, input)).rejects.toMatchObject({ code: "not_found" });
  });
});
