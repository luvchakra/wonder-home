import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { createRazorpayProvider } from "./razorpay";
import { hmacHex } from "./signature";
import { handleBillingWebhook } from "./webhook";

/**
 * Story 20-009, end to end through the webhook: a Razorpay subscription's life
 * lands in the subscription row and the payments ledger, each thing once, a
 * payment only ever moving forward, and a refund tied to its household through
 * our own ledger — never the payload.
 */

const SECRET = "rzp_whsec_ledger";
const HOUSEHOLD = "4f1c2a3b-0000-4000-8000-00000000000a";
const provider = createRazorpayProvider({ keyId: "k", keySecret: "s", webhookSecret: SECRET });

type Row = Record<string, unknown>;

/** A small in-memory stand-in for the service-role client, enough for the ledger's queries. */
function memoryAdmin() {
  const tables = new Map<string, Row[]>();
  const rows = (table: string) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  };
  let nextId = 1;
  const conflictKeys: Record<string, string[]> = {
    billing_events: ["provider", "provider_event_id"],
    household_subscriptions: ["household_id"],
    payments: ["provider", "provider_payment_id"],
    billing_invoices: ["provider", "provider_invoice_id"],
  };

  function query(table: string) {
    const filters: [string, unknown][] = [];
    const matching = () => rows(table).filter((row) => filters.every(([key, value]) => row[key] === value));
    const builder = {
      select: () => builder,
      eq(key: string, value: unknown) {
        filters.push([key, value]);
        return builder;
      },
      in: () => builder,
      order: () => builder,
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: matching(), error: null }),
    };
    return builder;
  }

  const client = {
    from(table: string) {
      return {
        ...query(table),
        upsert(values: Row, options?: { ignoreDuplicates?: boolean }) {
          const keys = conflictKeys[table] ?? ["id"];
          const existing = rows(table).find((row) => keys.every((key) => row[key] === values[key]));
          let written: Row | null;
          if (existing) {
            if (options?.ignoreDuplicates) written = null;
            else {
              Object.assign(existing, values);
              written = existing;
            }
          } else {
            written = { id: `row-${nextId++}`, ...values };
            rows(table).push(written);
          }
          const result = written ? [written] : [];
          return {
            select: () => ({
              maybeSingle: async () => ({ data: result[0] ?? null, error: null }),
              then: (resolve: (value: unknown) => void) => resolve({ data: result, error: null }),
            }),
            then: (resolve: (value: unknown) => void) => resolve({ error: null }),
          };
        },
        insert(values: Row) {
          rows(table).push({ id: `row-${nextId++}`, ...values });
          return Promise.resolve({ error: null });
        },
        update(values: Row) {
          const filters: [string, unknown][] = [];
          const chain = {
            eq(key: string, value: unknown) {
              filters.push([key, value]);
              return chain;
            },
            then(resolve: (value: unknown) => void) {
              for (const row of rows(table)) if (filters.every(([key, value]) => row[key] === value)) Object.assign(row, values);
              resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, rows };
}

const CREATED = 1790300000;
const sub = (paidCount: number) => ({
  id: "sub_L1",
  current_start: CREATED,
  current_end: CREATED + 30 * 86400,
  paid_count: paidCount,
  notes: { household_id: HOUSEHOLD, plan_key: "pro", intent_id: null, interval: "month", currency: "INR" },
});
const pay = (id: string, over: Row = {}) => ({ id, amount: 29900, currency: "INR", method: "card", card: { last4: "4242", number: "should-never-be-read" }, created_at: CREATED, ...over });

async function deliver(admin: SupabaseClient, eventId: string, body: Row) {
  const raw = JSON.stringify(body);
  const request = new Request("https://app.example/api/v1/billing/webhook/razorpay", {
    method: "POST",
    body: raw,
    headers: { "x-razorpay-signature": await hmacHex(SECRET, raw), "x-razorpay-event-id": eventId },
  });
  const response = await handleBillingWebhook(request, { provider, admin: () => admin });
  return (await response.json()) as Row;
}

describe("a Razorpay subscription's life, through the webhook", () => {
  it("activates the plan with its terms and puts the first payment in the ledger, once", async () => {
    const { client, rows } = memoryAdmin();
    const activated = { event: "subscription.activated", created_at: CREATED, payload: { subscription: { entity: sub(1) }, payment: { entity: pay("pay_1") } } };
    expect(await deliver(client, "evt_a", activated)).toMatchObject({ acted: true, duplicate: false });
    expect(rows("household_subscriptions")[0]).toMatchObject({ plan_key: "pro", status: "active", provider: "razorpay", billing_interval: "month", currency: "INR", amount: 299, cancel_at_period_end: false });
    expect(rows("payments")).toHaveLength(1);
    expect(rows("payments")[0]).toMatchObject({ provider_payment_id: "pay_1", amount: 299, currency: "INR", status: "succeeded", method: "card", method_last4: "4242" });
    expect(JSON.stringify(rows("payments"))).not.toContain("should-never-be-read");

    // Redelivered: nothing more.
    expect(await deliver(client, "evt_a", activated)).toMatchObject({ acted: false, duplicate: true });
    expect(rows("payments")).toHaveLength(1);
    expect(rows("billing_events")).toHaveLength(1);
  });

  it("a renewal moves the period on and adds its payment; a failed one falls behind without losing the plan", async () => {
    const { client, rows } = memoryAdmin();
    await deliver(client, "evt_a", { event: "subscription.activated", created_at: CREATED, payload: { subscription: { entity: sub(1) }, payment: { entity: pay("pay_1") } } });
    await deliver(client, "evt_r", { event: "subscription.charged", created_at: CREATED + 30 * 86400, payload: { subscription: { entity: { ...sub(2), current_start: CREATED + 30 * 86400, current_end: CREATED + 60 * 86400 } }, payment: { entity: pay("pay_2") } } });
    expect(rows("payments").map((row) => row.provider_payment_id)).toEqual(["pay_1", "pay_2"]);
    expect(rows("household_subscriptions")[0]).toMatchObject({ plan_key: "pro", status: "active" });

    await deliver(client, "evt_h", { event: "subscription.halted", created_at: CREATED + 61 * 86400, payload: { subscription: { entity: sub(2) } } });
    expect(rows("household_subscriptions")[0]).toMatchObject({ plan_key: "pro", status: "past_due" });

    await deliver(client, "evt_c", { event: "subscription.cancelled", created_at: CREATED + 70 * 86400, payload: { subscription: { entity: sub(2) } } });
    expect(rows("household_subscriptions")[0]).toMatchObject({ plan_key: "free", status: "active", provider: null, amount: null });
    // The history is kept: cancelling removes nothing from the ledger.
    expect(rows("payments")).toHaveLength(2);
  });

  it("a payment never moves backwards, whatever order the provider delivers in", async () => {
    const { client, rows } = memoryAdmin();
    await deliver(client, "evt_a", { event: "subscription.activated", created_at: CREATED, payload: { subscription: { entity: sub(1) }, payment: { entity: pay("pay_1") } } });
    // A late declined-attempt report about the same payment.
    await deliver(client, "evt_late", { event: "payment.failed", created_at: CREATED - 60, payload: { payment: { entity: pay("pay_1", { error_code: "GATEWAY_ERROR", notes: { household_id: HOUSEHOLD } }) } } });
    expect(rows("payments")[0]).toMatchObject({ status: "succeeded", failure_code: null });
  });

  it("a refund finds its household through the ledger, and adds up to refunded", async () => {
    const { client, rows } = memoryAdmin();
    await deliver(client, "evt_a", { event: "subscription.activated", created_at: CREATED, payload: { subscription: { entity: sub(1) }, payment: { entity: pay("pay_1") } } });
    await deliver(client, "evt_f1", { event: "refund.processed", created_at: CREATED + 100, payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 10000, currency: "INR" } } } });
    expect(rows("payment_refunds")[0]).toMatchObject({ household_id: HOUSEHOLD, amount: 100, status: "succeeded" });
    expect(rows("payments")[0]).toMatchObject({ status: "partially_refunded" });
    await deliver(client, "evt_f2", { event: "refund.processed", created_at: CREATED + 200, payload: { refund: { entity: { id: "rfnd_2", payment_id: "pay_1", amount: 19900, currency: "INR" } } } });
    expect(rows("payments")[0]).toMatchObject({ status: "refunded" });
    // The subscription is not a refund's business.
    expect(rows("household_subscriptions")[0]).toMatchObject({ plan_key: "pro", status: "active" });
  });

  it("a refund for a payment we never recorded is tied to nobody, and writes nothing", async () => {
    const { client, rows } = memoryAdmin();
    const answer = await deliver(client, "evt_x", { event: "refund.processed", created_at: CREATED, payload: { refund: { entity: { id: "rfnd_9", payment_id: "pay_unknown", amount: 100, currency: "INR" } } } });
    expect(answer).toMatchObject({ received: true, acted: false });
    expect(rows("payment_refunds")).toHaveLength(0);
    expect(rows("billing_events")).toHaveLength(0);
  });
});
