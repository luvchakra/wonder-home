import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";

import { forgetPlatformData } from "../lib/platform-cache";
import { loadSubscription } from "./repository";

beforeEach(() => forgetPlatformData("plan_catalog"));

const FEATURES = [
  { plan_key: "free", feature_key: "conversation.text", enabled: true, limit_per_period: 50, period: "month" },
  { plan_key: "family", feature_key: "conversation.text", enabled: true, limit_per_period: 500, period: "month" },
];

/** Two households on different plans, each answered only for its own id, counting every read. */
function project(plans: Record<string, string>) {
  const reads: string[] = [];
  const client = (asHousehold: string) =>
    ({
      from(table: string) {
        reads.push(table);
        const filters: Record<string, unknown> = {};
        const result = () => {
          if (table === "household_subscriptions") {
            // RLS: a member reads only their own household's row.
            const own = filters.household_id === asHousehold ? plans[asHousehold] : undefined;
            return { data: own ? { plan_key: own, status: "active", current_period_start: "2026-10-01T00:00:00Z" } : null, error: null };
          }
          if (table === "plan_features") return { data: FEATURES, error: null };
          return { data: [], error: null };
        };
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => ((filters[column] = value), builder),
          maybeSingle: async () => result(),
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
        };
        return builder;
      },
    }) as unknown as SupabaseClient;
  return { client, reads };
}

describe("the per-server plan catalogue never carries one household's answer to another", () => {
  it("reads the catalogue once, and each household's own plan every time", async () => {
    const { client, reads } = project({ "household-a": "free", "household-b": "family" });

    const a = await loadSubscription(client("household-a"), "household-a");
    const b = await loadSubscription(client("household-b"), "household-b");

    expect(a?.planKey).toBe("free");
    expect(a?.features.find((feature) => feature.featureKey === "conversation.text")?.limitPerPeriod).toBe(50);
    expect(b?.planKey).toBe("family");
    expect(b?.features.find((feature) => feature.featureKey === "conversation.text")?.limitPerPeriod).toBe(500);

    expect(reads.filter((table) => table === "household_subscriptions")).toHaveLength(2);
    expect(reads.filter((table) => table === "plan_features")).toHaveLength(1);
  });

  it("keeps nothing a refused caller saw: no feature rows is answered, not kept", async () => {
    let features: unknown[] = [];
    const reads: string[] = [];
    const client = {
      from(table: string) {
        reads.push(table);
        const result = () => (table === "plan_features" ? { data: features, error: null } : { data: table === "household_subscriptions" ? null : [], error: null });
        const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => result(), then: (ok: (v: unknown) => unknown, ko: (r: unknown) => unknown) => Promise.resolve(result()).then(ok, ko) };
        return builder;
      },
    } as unknown as SupabaseClient;

    expect(await loadSubscription(client, "household-c")).toBeNull();
    features = FEATURES;
    await Promise.resolve();
    expect((await loadSubscription(client, "household-d"))?.planKey).toBe("free");
    expect(reads.filter((table) => table === "plan_features")).toHaveLength(2);
  });
});
