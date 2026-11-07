import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { FEATURES } from "./entitlements";
import { diffPlan, planEditSchema, savePlan } from "./plan-edit";
import { featureLines, parseAmount, planBadge, yearlySavingWords, type PlanSnapshot } from "./plan-shared";
import { platformCan, type PlatformAdmin } from "../platform/admin";

const pro: PlanSnapshot = {
  key: "pro",
  name: "Pro",
  description: "The full household.",
  requiresPayment: false,
  active: true,
  monthly: 299,
  yearly: 2870,
  features: [
    { featureKey: "conversation.text", enabled: true, limit: 2000, period: "month" },
    { featureKey: "family.events", enabled: true, limit: null, period: "forever" },
  ],
};
const edit = (patch: Record<string, unknown> = {}) =>
  planEditSchema.parse({ name: "Pro", description: "The full household.", monthly: "299", yearly: "2870", features: [{ featureKey: "conversation.text", enabled: true, limit: 2000 }, { featureKey: "family.events", enabled: true, limit: null }], ...patch });

describe("the badge", () => {
  it("is Free only when nothing is charged", () => {
    expect(planBadge({ requiresPayment: false, monthly: null, yearly: null })).toBe("free");
    expect(planBadge({ requiresPayment: false, monthly: 0, yearly: 0 })).toBe("free");
    expect(planBadge({ requiresPayment: false, monthly: 299, yearly: 2870 })).toBe("earlyAccess");
    expect(planBadge({ requiresPayment: true, monthly: 299, yearly: null })).toBe("paid");
  });
});

describe("decimal prices", () => {
  it("accepts plain amounts and refuses everything else", () => {
    expect(parseAmount("349")).toBe(349);
    expect(parseAmount("349.5")).toBe(349.5);
    for (const bad of ["-1", "3.499", "1,000", "₹5", "", "abc", "1e3"]) expect(parseAmount(bad)).toBeNull();
    expect(() => edit({ monthly: "3.499" })).toThrow();
    expect(edit({ monthly: "" }).monthly).toBeNull();
  });
  it("says the yearly saving in words", () => {
    expect(yearlySavingWords(299, 2870)).toContain("save 20%");
    expect(yearlySavingWords(299, 4000)).toContain("no saving");
    expect(yearlySavingWords(null, 2870)).toBeNull();
  });
});

describe("what saving says changes", () => {
  it("is empty when nothing changed", () => expect(diffPlan(pro, edit())).toEqual([]));
  it("tells the truth about an unpaid plan's price", () => {
    const [change] = diffPlan(pro, edit({ monthly: "349" }));
    expect(change!.line).toContain("Pro price goes from ₹299 a month to ₹349 a month");
    expect(change!.line).toContain("no household is charged");
  });
  it("sends a paid plan's renewals to the provider", () => {
    const [change] = diffPlan({ ...pro, requiresPayment: true }, edit({ monthly: "349" }));
    expect(change!.line).toContain("payment provider");
  });
  it("names a feature by its member label, never its key", () => {
    const [change] = diffPlan(pro, edit({ features: [{ featureKey: "conversation.text", enabled: false, limit: null }, { featureKey: "family.events", enabled: true, limit: null }] }));
    expect(change!.line).toContain(FEATURES["conversation.text"]);
    expect(change!.line).not.toContain("conversation.text");
  });
});

describe("every plan feature has a member label", () => {
  it("covers every key the migrations seed", () => {
    const dir = join(__dirname, "../../../../supabase/migrations");
    const keys = new Set<string>();
    for (const file of readdirSync(dir)) {
      const text = readFileSync(join(dir, file), "utf8");
      for (const block of text.match(/insert into public\.plan_features[\s\S]*?;/gi) ?? []) for (const match of block.matchAll(/'([a-z]+\.[a-z_]+)'/g)) keys.add(match[1]!);
    }
    expect(keys.size).toBeGreaterThan(10);
    for (const key of keys) expect(Object.keys(FEATURES), key).toContain(key);
    expect(featureLines(pro.features)[0]!.label).toBe("Text conversation");
  });
});

/** A recording stand-in for the service-role client. */
function fakeAdmin(snapshot: PlanSnapshot) {
  const writes: { table: string; op: string; value: unknown }[] = [];
  const reads: Record<string, unknown[]> = {
    plans: [{ key: snapshot.key, name: snapshot.name, description: snapshot.description, requires_payment: snapshot.requiresPayment, active: snapshot.active }],
    plan_prices: [
      ...(snapshot.monthly === null ? [] : [{ plan_key: snapshot.key, billing_interval: "month", amount: snapshot.monthly }]),
      ...(snapshot.yearly === null ? [] : [{ plan_key: snapshot.key, billing_interval: "year", amount: snapshot.yearly }]),
    ],
    plan_features: snapshot.features.map((row) => ({ plan_key: snapshot.key, feature_key: row.featureKey, enabled: row.enabled, limit_per_period: row.limit, period: row.period })),
  };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const done = (value: unknown) => ({ then: (resolve: (v: unknown) => unknown) => resolve(value) });
    for (const name of ["select", "order", "eq", "limit"]) chain[name] = () => Object.assign(chain, done({ data: reads[table] ?? [], error: null }));
    chain.update = (value: unknown) => {
      writes.push({ table, op: "update", value });
      const filters: Record<string, unknown> = new Proxy({}, { get: (_, key) => (key === "then" ? (resolve: (v: unknown) => unknown) => resolve({ error: null }) : () => filters) });
      return filters;
    };
    chain.insert = (value: unknown) => {
      writes.push({ table, op: "insert", value });
      return Promise.resolve({ error: null });
    };
    return chain;
  };
  return { client: { from } as never, writes };
}

const owner: PlatformAdmin = { profileId: "owner-1", role: "owner" };
const operator: PlatformAdmin = { profileId: "op-1", role: "operator" };

describe("saving a plan", () => {
  it("is for the platform owner only", async () => {
    expect(platformCan(owner, "plans.edit")).toBe(true);
    expect(platformCan(operator, "plans.edit")).toBe(false);
    expect(platformCan({ profileId: "s", role: "support" }, "plans.edit")).toBe(false);
    const { client, writes } = fakeAdmin(pro);
    await expect(savePlan(client, operator, "pro", edit({ monthly: "349" }))).rejects.toThrow(/platform owner/);
    expect(writes).toEqual([]);
  });

  it("writes nothing on a dry run", async () => {
    const { client, writes } = fakeAdmin(pro);
    const result = await savePlan(client, owner, "pro", edit({ monthly: "349" }), { dryRun: true });
    expect(result.changed).toBe(false);
    expect(result.changes).toHaveLength(1);
    expect(writes).toEqual([]);
  });

  it("retires the old price, adds the new one, clears the catalogue cache and audits who changed what", async () => {
    const audit = vi.fn();
    vi.doMock("../api/audit", () => ({ recordAuditEvent: audit }));
    vi.resetModules();
    const forget = vi.fn();
    vi.doMock("../lib/platform-cache", () => ({ forgetPlatformData: forget }));
    const { savePlan: save } = await import("./plan-edit");
    const { client, writes } = fakeAdmin(pro);
    const result = await save(client, owner, "pro", edit({ monthly: "349", name: "Pro+" }));
    expect(result.changed).toBe(true);
    expect(writes).toContainEqual({ table: "plans", op: "update", value: { name: "Pro+", description: "The full household." } });
    expect(writes).toContainEqual({ table: "plan_prices", op: "update", value: { active: false } });
    expect(writes).toContainEqual({ table: "plan_prices", op: "insert", value: { plan_key: "pro", billing_interval: "month", currency: "INR", amount: 349 } });
    expect(forget).toHaveBeenCalledWith("plan_catalog");
    const entry = audit.mock.calls[0]![1];
    expect(entry).toMatchObject({ eventType: "platform.plan_updated", actorProfileId: "owner-1", householdId: null });
    expect(entry.metadata.changes).toContainEqual({ field: "price.month", from: 299, to: 349 });
    vi.doUnmock("../api/audit");
    vi.doUnmock("../lib/platform-cache");
  });
});
