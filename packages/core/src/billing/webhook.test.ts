import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { handleBillingWebhook } from "./webhook";
import { createStripeProvider } from "./stripe";

/** Story 20-006: the webhook's front door, and applying each event exactly once. */

const SECRET = "whsec_test";
const NOW = new Date("2026-09-24T10:00:00Z");
const HOUSEHOLD = "4f1c2a3b-0000-4000-8000-000000000002";

async function sign(body: string) {
  const timestamp = Math.floor(NOW.getTime() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return `t=${timestamp},v1=${[...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const provider = createStripeProvider({ secretKey: "sk_test", webhookSecret: SECRET, prices: { pro: "price_pro" } });

/** A service-role client stand-in: event ids are unique, subscriptions are one row per household. */
function fakeAdmin() {
  const events = new Set<string>();
  const subscriptions = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  const client = {
    from(table: string) {
      return {
        upsert(values: Record<string, unknown>) {
          if (table === "billing_events") {
            const key = `${values.provider}:${values.provider_event_id}`;
            const fresh = !events.has(key);
            events.add(key);
            return { select: async () => ({ data: fresh ? [{ id: key }] : [], error: null }) };
          }
          writes.push(`${table}:upsert:${values.plan_key}:${values.status}`);
          subscriptions.set(values.household_id as string, values);
          return Promise.resolve({ error: null });
        },
        select() {
          return { eq: () => ({ maybeSingle: async () => ({ data: subscriptions.get(HOUSEHOLD) ?? null, error: null }) }) };
        },
        update(values: Record<string, unknown>) {
          writes.push(`${table}:update:${JSON.stringify(values)}`);
          const chain = { eq: () => chain, then: (resolve: (value: unknown) => void) => resolve({ error: null }) };
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, writes, subscriptions };
}

const activation = JSON.stringify({
  id: "evt_1",
  type: "checkout.session.completed",
  created: Math.floor(NOW.getTime() / 1000),
  data: { object: { mode: "subscription", subscription: "sub_1", metadata: { household_id: HOUSEHOLD, plan_key: "pro", intent_id: "i-1" } } },
});

const post = async (body: string, signature?: string) =>
  new Request("https://app.example/api/v1/billing/webhook", { method: "POST", body, headers: { "stripe-signature": signature ?? (await sign(body)) } });

describe("the billing webhook", () => {
  it("is a 404 when no billing provider is configured", async () => {
    const response = await handleBillingWebhook(await post(activation), { provider: null, admin: () => fakeAdmin().client, now: NOW });
    expect(response.status).toBe(404);
  });

  it("rejects a delivery whose signature does not verify, and changes nothing", async () => {
    const admin = fakeAdmin();
    const response = await handleBillingWebhook(await post(activation, "t=1,v1=deadbeef"), { provider, admin: () => admin.client, now: NOW });
    expect(response.status).toBe(400);
    expect(admin.writes).toEqual([]);
  });

  it("applies a verified activation, then treats the redelivery as the duplicate it is", async () => {
    const admin = fakeAdmin();
    const first = await handleBillingWebhook(await post(activation), { provider, admin: () => admin.client, now: NOW });
    expect(await first.json()).toMatchObject({ acted: true, duplicate: false });
    expect(admin.subscriptions.get(HOUSEHOLD)).toMatchObject({ plan_key: "pro", status: "active", external_ref: "sub_1" });

    const again = await handleBillingWebhook(await post(activation), { provider, admin: () => admin.client, now: NOW });
    expect(await again.json()).toMatchObject({ acted: false, duplicate: true });
    expect(admin.writes.filter((write) => write.startsWith("household_subscriptions"))).toHaveLength(1);
  });

  it("acknowledges an event it does not act on without touching anything", async () => {
    const admin = fakeAdmin();
    const body = JSON.stringify({ id: "evt_x", type: "customer.created", created: 1, data: { object: {} } });
    const response = await handleBillingWebhook(await post(body), { provider, admin: () => admin.client, now: NOW });
    expect(await response.json()).toMatchObject({ received: true, acted: false });
    expect(admin.writes).toEqual([]);
  });
});
