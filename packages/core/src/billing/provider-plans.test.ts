import { describe, expect, it, vi } from "vitest";

import type { PlatformAdmin } from "../platform/admin";
import type { BillingProvider, ProviderPlan } from "./provider";
import { linkProviderPlan, planMatchesPrice } from "./provider-plans";

vi.mock("../api/audit", () => ({ recordAuditEvent: vi.fn() }));

/** Linking our prices to Razorpay plans (story 20-009, owner request 2026-11-20). */

const PRICE = "7c1d2e3f-0000-4000-8000-000000000001";
const owner: PlatformAdmin = { profileId: "owner-1", role: "owner" };

function fakeAdmin(links: { plan_price_id: string; provider: string; provider_plan_ref: string }[] = []) {
  const writes: { table: string; op: string; value: unknown }[] = [];
  const reads: Record<string, unknown[]> = {
    plan_prices: [{ id: PRICE, plan_key: "pro", billing_interval: "month", currency: "INR", amount: 299 }],
    plans: [{ key: "pro", name: "Pro", requires_payment: false, sort_order: 2 }],
    payment_provider_plans: links,
  };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const done = { then: (resolve: (v: unknown) => unknown) => resolve({ data: reads[table] ?? [], error: null }) };
    for (const name of ["select", "order", "eq", "limit", "in"]) chain[name] = () => Object.assign(chain, done);
    const ok: Record<string, unknown> = new Proxy({}, { get: (_, key) => (key === "then" ? (resolve: (v: unknown) => unknown) => resolve({ error: null }) : () => ok) });
    chain.update = (value: unknown) => (writes.push({ table, op: "update", value }), ok);
    chain.upsert = (value: unknown) => (writes.push({ table, op: "upsert", value }), Promise.resolve({ error: null }));
    return chain;
  };
  return { client: { from } as never, writes };
}

function fakeProvider(plan: ProviderPlan | null, live = true) {
  const created: unknown[] = [];
  const provider: BillingProvider = {
    name: "razorpay",
    live,
    currencies: ["INR"],
    sells: () => false,
    createCheckout: () => Promise.reject(new Error("unused")),
    readWebhook: () => Promise.resolve(null),
    createPlan: async (input) => (created.push(input), plan ?? { ref: "plan_NEW", interval: input.interval, amount: input.amount, currency: input.currency }),
    fetchPlan: async () => plan,
  };
  return { provider, created };
}

describe("a provider's plan is linked only when it bills exactly our price", () => {
  it("compares to the paisa, by currency and interval", () => {
    const price = { interval: "month" as const, currency: "INR", amount: 299 };
    expect(planMatchesPrice({ ref: "plan_a", interval: "month", amount: 299, currency: "INR" }, price)).toBe(true);
    expect(planMatchesPrice({ ref: "plan_a", interval: "month", amount: 299.01, currency: "INR" }, price)).toBe(false);
    expect(planMatchesPrice({ ref: "plan_a", interval: "year", amount: 299, currency: "INR" }, price)).toBe(false);
    expect(planMatchesPrice({ ref: "plan_a", interval: "month", amount: 299, currency: "USD" }, price)).toBe(false);
  });

  it("creates the plan from our price and maps it, server side", async () => {
    const { client, writes } = fakeAdmin();
    const { provider, created } = fakeProvider(null);
    expect(await linkProviderPlan(client, owner, provider, { priceId: PRICE })).toEqual({ ref: "plan_NEW", created: true });
    expect(created).toEqual([{ priceId: PRICE, name: "WonderHome Pro (monthly)", interval: "month", amount: 299, currency: "INR" }]);
    expect(writes).toContainEqual({ table: "payment_provider_plans", op: "upsert", value: { plan_price_id: PRICE, provider: "razorpay", provider_plan_ref: "plan_NEW", active: true } });
  });

  it("refuses a pasted plan that bills something else, and writes nothing", async () => {
    const { client, writes } = fakeAdmin();
    const { provider } = fakeProvider({ ref: "plan_OLD", interval: "month", amount: 249, currency: "INR" });
    await expect(linkProviderPlan(client, owner, provider, { priceId: PRICE, ref: "plan_OLD" })).rejects.toThrow(/doesn't bill this price/);
    const missing = fakeProvider(null).provider;
    missing.fetchPlan = async () => null;
    await expect(linkProviderPlan(client, owner, missing, { priceId: PRICE, ref: "plan_GONE" })).rejects.toThrow(/wasn't found/);
    expect(writes).toEqual([]);
  });

  it("is the platform owner's, and needs a configured provider", async () => {
    const { client, writes } = fakeAdmin();
    await expect(linkProviderPlan(client, { profileId: "op", role: "operator" }, fakeProvider(null).provider, { priceId: PRICE })).rejects.toThrow(/platform owner/);
    await expect(linkProviderPlan(client, owner, fakeProvider(null, false).provider, { priceId: PRICE })).rejects.toThrow(/isn't set up/);
    await expect(linkProviderPlan(client, owner, null, { priceId: PRICE })).rejects.toThrow(/isn't set up/);
    expect(writes).toEqual([]);
  });
});
