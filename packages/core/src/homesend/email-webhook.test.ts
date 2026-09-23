import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { IntakeExtraction } from "../ai/classify-intake";
import type { ReceivedEmail } from "./email-gateway";
import { handleEmailWebhook, type EmailWebhookDeps } from "./email-webhook";
import type { IngestDeps } from "./ingest";
import { fakeSupabase } from "./testing";

/**
 * The email webhook as one delivery path (test spec HS-006, HS-008, HS-009):
 * signature → parse → recipient routing → fetch → keep → understand →
 * attachments → events, with Resend and the model stood in.
 */

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const ADDRESS = "hs-mehta@inbox.wonderhome.test";
const SECRET = "whsec_" + Buffer.from("a-test-signing-secret-32-bytes!!").toString("base64");
const NOW = new Date("2026-09-23T05:00:00Z");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);

const SPORTS_DAY: IntakeExtraction = {
  readable: true, kind: "school_item", title: "Sports Day", notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: "2026-09-26",
  schoolKind: "event", subject: null, quantity: null, unit: null, category: null, healthRecordType: null, documentDate: null, dateText: "Saturday 26 September",
  merchant: null,
  lines: [],
  subjectMemberName: null, summary: "Sports Day is on Saturday 26 September.", people: [], facts: [], needs: [], change: "new", confidence: "high", secondary: null,
};

const EMAIL: ReceivedEmail = {
  id: "email-1", from: "Green Valley School <office@greenvalley.example.org>", to: [ADDRESS], cc: [], created_at: "2026-09-23T04:55:00Z",
  subject: "Sports Day", text: "Sports Day is Saturday 26 September. Please send a white T-shirt.", html: null,
  attachments: [{ id: "att-1", filename: "circular.png", content_type: "image/png", size: PNG.length }],
};

function delivery(body: object, options: { secret?: string; timestamp?: number; id?: string } = {}): Request {
  const raw = JSON.stringify(body);
  const id = options.id ?? "msg_1";
  const timestamp = String(options.timestamp ?? Math.floor(NOW.getTime() / 1000));
  const secretBytes = Buffer.from((options.secret ?? SECRET).slice("whsec_".length), "base64");
  const signature = `v1,${createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${raw}`).digest("base64")}`;
  return new Request("https://wonderhome.test/api/v1/homesend/email/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature },
    body: raw,
  });
}

const RECEIVED = { type: "email.received", data: { email_id: "email-1", to: [ADDRESS], received_for: [] } };

function harness() {
  const db = fakeSupabase({ homesend_addresses: [{ household_id: HOUSEHOLD, address: ADDRESS, status: "active" }] });
  const calls = { fetchEmail: 0, fetchAttachment: 0, classify: 0, deferred: 0 };
  const ingest: IngestDeps = {
    classify: async () => {
      calls.classify += 1;
      return SPORTS_DAY;
    },
    scan: async () => ({ scanned: false }),
  };
  const deps: EmailWebhookDeps = {
    config: { apiKey: "re_test", webhookSecret: SECRET },
    supabase: db.client,
    fetchEmail: async () => {
      calls.fetchEmail += 1;
      return EMAIL;
    },
    fetchAttachment: async () => {
      calls.fetchAttachment += 1;
      return { ok: true, filename: "circular.png", contentType: "image/png", bytes: PNG };
    },
    ingest,
    defer: () => {
      calls.deferred += 1;
    },
    now: () => NOW,
  };
  const items = () => db.tables.home_send_items ?? [];
  const events = () => (db.tables.homesend_email_events ?? []).map((row) => row.kind);
  return { db, deps, calls, items, events };
}

describe("HS-008 — a delivery that cannot prove it is Resend's changes nothing", () => {
  it("unconfigured: the same 401 an anonymous caller gets, and nothing read", async () => {
    const { deps, calls, items } = harness();
    const response = await handleEmailWebhook(delivery(RECEIVED), { ...deps, config: null });
    expect(response.status).toBe(401);
    expect(calls).toEqual({ fetchEmail: 0, fetchAttachment: 0, classify: 0, deferred: 0 });
    expect(items()).toHaveLength(0);
  });

  it.each([
    ["a signature made with another secret", () => delivery(RECEIVED, { secret: "whsec_" + Buffer.from("somebody-elses-secret-32-bytes!!").toString("base64") })],
    ["a replayed delivery from ten minutes ago", () => delivery(RECEIVED, { timestamp: Math.floor(NOW.getTime() / 1000) - 600 })],
    [
      "a body changed after signing",
      () => {
        const signed = delivery(RECEIVED);
        return new Request(signed.url, { method: "POST", headers: signed.headers, body: JSON.stringify({ ...RECEIVED, data: { ...RECEIVED.data, to: ["attacker@example.org"] } }) });
      },
    ],
  ])("%s: 401, no intake row, no fetch, no model, no run", async (_label, make) => {
    const { deps, calls, items, events } = harness();
    const response = await handleEmailWebhook(make(), deps);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "unauthenticated", message: "Authentication required.", requestId: "homesend-email-webhook" } });
    expect(items()).toHaveLength(0);
    expect(calls).toEqual({ fetchEmail: 0, fetchAttachment: 0, classify: 0, deferred: 0 });
    expect(events()).toEqual(["signature_failed"]);
  });

  it("a body far larger than any real delivery is refused before it is read as anything", async () => {
    const { deps, items } = harness();
    const huge = new Request("https://wonderhome.test/x", { method: "POST", headers: { "content-length": String(2 * 1024 * 1024) }, body: "x" });
    expect((await handleEmailWebhook(huge, deps)).status).toBe(413);
    expect(items()).toHaveLength(0);
  });
});

describe("HS-006 — a genuine forwarded email, end to end through the webhook", () => {
  it("routes by recipient, keeps the email and its attachment as their own items, reads them, and records what happened", async () => {
    const { deps, calls, items, events } = harness();
    const response = await handleEmailWebhook(delivery(RECEIVED), deps);
    expect(response.status).toBe(200);

    const email = items().find((row) => row.source === "email")!;
    expect(email).toMatchObject({ household_id: HOUSEHOLD, external_id: "email-1", created_by_member_id: null, subject: "Sports Day", status: "classified", classified_kind: "school_item" });
    const attachment = items().find((row) => row.parent_item_id === email.id);
    expect(attachment).toMatchObject({ household_id: HOUSEHOLD, external_id: "email-1:att-1" });
    expect(calls.fetchEmail).toBe(1);
    expect(calls.fetchAttachment).toBe(1);
    expect(events()).toEqual(expect.arrayContaining(["delivered", "processed"]));
    expect(events()).not.toContain("signature_failed");
  });

  it("an address no household owns is acknowledged and nothing is fetched or kept — never saying which addresses are real", async () => {
    const { deps, calls, items, events } = harness();
    const response = await handleEmailWebhook(delivery({ ...RECEIVED, data: { ...RECEIVED.data, to: ["someone-else@inbox.wonderhome.test"] } }), deps);
    expect(response.status).toBe(200);
    expect(calls.fetchEmail).toBe(0);
    expect(items()).toHaveLength(0);
    expect(events()).toEqual(["delivered", "unrouted"]);
  });
});

describe("HS-009 — the same delivery twice is one email, read once", () => {
  it("a retried webhook keeps no second copy, asks the model nothing new, and says it was a duplicate", async () => {
    const { deps, calls, items, events } = harness();
    await handleEmailWebhook(delivery(RECEIVED), deps);
    const afterFirst = { items: items().length, classify: calls.classify };
    const second = await handleEmailWebhook(delivery(RECEIVED, { id: "msg_1_retry" }), deps);
    expect(second.status).toBe(200);
    expect(items()).toHaveLength(afterFirst.items);
    expect(items().filter((row) => row.source === "email")).toHaveLength(1);
    expect(calls.classify).toBe(afterFirst.classify);
    expect(events()).toContain("duplicate");
  });
});
