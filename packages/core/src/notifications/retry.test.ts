import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Mailer } from "../email/mailer";
import { summariseDelivery } from "./delivery-report";
import { CHANNEL_ADAPTERS } from "./channels";
import { deliverNotification } from "./deliver";
import { createEmailAdapter } from "./email";
import { enqueueNotificationRetry, NOTIFICATION_RETRY_ATTEMPTS, NOTIFICATION_RETRY_KIND } from "./retry";
import { notificationJobHandlers, notificationRetryHandler } from "./retry-handler";

type Row = Record<string, unknown>;

/** A database that answers each table with the rows it was given, and records inserts. */
function fakeDatabase(tables: Record<string, Row[]>) {
  const inserts: { table: string; values: Row | Row[] }[] = [];
  const client = {
    from(table: string) {
      const rows = () => tables[table] ?? [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        in: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: () => chain,
        update: () => chain,
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        insert: (values: Row | Row[]) => {
          inserts.push({ table, values });
          return Promise.resolve({ error: null });
        },
        then: (resolve: (value: unknown) => void) => resolve({ data: rows(), count: 0, error: null }),
      };
      return chain;
    },
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: { email: "kunal@example.com", email_confirmed_at: "2026-10-01T00:00:00Z" } } }) } },
  };
  return { client: client as unknown as SupabaseClient, inserts };
}

const PREFERENCES = [{ channel: "email", enabled: true, quiet_from: null, quiet_until: null, target: null }];
const MEMBER = { profile_id: "u1", language: null, date_format: null, time_format: null, measurement_system: null };
const HOUSEHOLD = { timezone: "Asia/Kolkata", region: "IN", currency: "INR", measurement_system: "metric", default_language: "en" };
const input = { householdId: "h1", notificationId: "n1", recipientMemberId: "m1", notification: { title: "Bill due", body: "Tomorrow", priority: "high" as const }, reason: "reminder" as const };
const mailer = (result: Awaited<ReturnType<Mailer["send"]>>): Mailer => ({ async send() { return result; } });
const tables = { notification_preferences: PREFERENCES, households: [HOUSEHOLD], household_members: [MEMBER] };

describe("queueing a retry (story 27-010)", () => {
  it("puts one job per notification and channel on the shared queue, bounded to three tries", async () => {
    const { client, inserts } = fakeDatabase({});
    expect(await enqueueNotificationRetry(client, { householdId: "h1", notificationId: "n1", channel: "email", reason: "reminder", now: new Date("2026-10-20T10:00:00Z") })).toBe(true);
    expect(inserts).toEqual([
      {
        table: "jobs",
        values: { household_id: "h1", kind: NOTIFICATION_RETRY_KIND, payload: { notificationId: "n1", channel: "email", reason: "reminder" }, dedupe_key: "n1:email", run_after: "2026-10-20T10:02:00.000Z", max_attempts: NOTIFICATION_RETRY_ATTEMPTS },
      },
    ]);
    expect(NOTIFICATION_RETRY_ATTEMPTS).toBe(3);
  });

  it("queues a failure the channel calls retryable, and says so in the event", async () => {
    const { client, inserts } = fakeDatabase(tables);
    const adapters = { ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer({ ok: false, reason: "unreachable" }), {}) };
    expect(await deliverNotification(client, input, adapters)).toEqual({ sent: [], failed: ["email"] });
    expect(inserts.find((entry) => entry.table === "jobs")?.values).toMatchObject({ kind: NOTIFICATION_RETRY_KIND, dedupe_key: "n1:email" });
    expect(inserts.find((entry) => entry.table === "notification_events")?.values).toEqual([expect.objectContaining({ event_type: "delivery_failed", metadata: { code: "unavailable", retryable: true } })]);
  });

  it("does not queue a refused address, a success, or the failure of a retry itself", async () => {
    for (const result of [{ ok: false, reason: "rejected" } as const, { ok: true } as const]) {
      const { client, inserts } = fakeDatabase(tables);
      await deliverNotification(client, input, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer(result), {}) });
      expect(inserts.some((entry) => entry.table === "jobs")).toBe(false);
    }
    const { client, inserts } = fakeDatabase(tables);
    await deliverNotification(client, { ...input, only: "email", retry: true }, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer({ ok: false, reason: "unreachable" }), {}) });
    expect(inserts.some((entry) => entry.table === "jobs")).toBe(false);
    expect(inserts.find((entry) => entry.table === "notification_events")?.values).toEqual([expect.objectContaining({ metadata: { code: "unavailable", retryable: true, retry: true } })]);
  });

  it("marks a send that went on a retry", async () => {
    const { client, inserts } = fakeDatabase(tables);
    await deliverNotification(client, { ...input, only: "email", retry: true }, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer({ ok: true }), {}) });
    expect(inserts.find((entry) => entry.table === "notification_events")?.values).toEqual([expect.objectContaining({ event_type: "sent", metadata: { retry: true } })]);
  });
});

describe("the retry handler", () => {
  const job = (payload: Row) => ({ id: "j1", household_id: "h1", kind: NOTIFICATION_RETRY_KIND, payload, attempts: 1 });
  const notification = { id: "n1", recipient_member_id: "m1", title: "Bill due", body: "Tomorrow", message: null, priority: "high", status: "delivered", category: "bills" };

  it("sends the same notification on the one channel, and is done when it arrives", async () => {
    const { client } = fakeDatabase({ ...tables, notifications: [notification] });
    const handler = notificationRetryHandler({ ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer({ ok: true }), {}) });
    expect(await handler(client, job({ notificationId: "n1", channel: "email", reason: "reminder" }))).toBe("read");
  });

  it("fails again, for the queue to back off, when the channel is still down", async () => {
    const { client } = fakeDatabase({ ...tables, notifications: [notification] });
    const handler = notificationRetryHandler({ ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer({ ok: false, reason: "unreachable" }), {}) });
    expect(await handler(client, job({ notificationId: "n1", channel: "email", reason: "reminder" }))).toBe("failed");
  });

  it("never sends what is no longer true, and skips a job it cannot read", async () => {
    const adapters = { ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer({ ok: true }), {}) };
    const settled = fakeDatabase({ ...tables, notifications: [{ ...notification, status: "resolved" }] });
    expect(await notificationRetryHandler(adapters)(settled.client, job({ notificationId: "n1", channel: "email", reason: "alert" }))).toBe("skipped");
    const gone = fakeDatabase({ ...tables, notifications: [] });
    expect(await notificationRetryHandler(adapters)(gone.client, job({ notificationId: "n1", channel: "email", reason: "alert" }))).toBe("skipped");
    expect(await notificationRetryHandler(adapters)(gone.client, job({ notificationId: "n1", channel: "carrier-pigeon", reason: "alert" }))).toBe("skipped");
  });

  it("is registered for every drain, so no worker claims it without a way to run it", () => {
    expect(Object.keys(notificationJobHandlers())).toEqual([NOTIFICATION_RETRY_KIND]);
  });
});

describe("summariseDelivery", () => {
  it("counts each channel, the reasons for failures, and what a retry saved", () => {
    const rows = [
      { channel: "email", event_type: "sent", metadata: {} },
      { channel: "email", event_type: "sent", metadata: { retry: true } },
      { channel: "email", event_type: "delivery_failed", metadata: { code: "unavailable", retryable: true } },
      { channel: "email", event_type: "delivery_failed", metadata: { code: "rejected" } },
      { channel: "push", event_type: "sent", metadata: {} },
      { channel: "whatsapp", event_type: "delivery_failed", metadata: null },
    ];
    expect(summariseDelivery(rows)).toEqual([
      { channel: "push", sent: 1, failed: 0, recovered: 0, reasons: {} },
      { channel: "email", sent: 2, failed: 2, recovered: 1, reasons: { unavailable: 1, rejected: 1 } },
      { channel: "whatsapp", sent: 0, failed: 1, recovered: 0, reasons: { unknown: 1 } },
    ]);
  });
});
