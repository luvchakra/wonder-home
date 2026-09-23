import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { CHANNEL_ADAPTERS, channelAdaptersFromEnv } from "./channels";
import { deliverNotification } from "./deliver";
import { createWhatsAppAdapter, isOptOut, readWhatsAppWebhook, verifyWhatsAppSignature, whatsappConfigFromEnv } from "./whatsapp";
import { handleWhatsAppWebhook } from "./whatsapp-webhook";

/** Story 17-006: WhatsApp as a real channel behind the 06-008 adapter shape. */

const CONFIG = { accessToken: "EAAG-test", phoneNumberId: "1098765", templateName: "wonderhome_update", templateLanguage: "en" };
const SECRET = "app-secret";
const NOTE = { title: "Electricity bill\\ndue", body: "Rs 2,340 is due   on Friday.", priority: "normal" as const };

function fakeFetch(respond: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

async function sign(body: string, secret = SECRET) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${[...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

describe("sending", () => {
  it("goes out as the approved template, the household's words as its two parameters, on one line each", async () => {
    const { fetchImpl, calls } = fakeFetch(() => new Response(JSON.stringify({ messages: [{ id: "wamid.ABC" }] }), { status: 200 }));
    const result = await createWhatsAppAdapter({ ...CONFIG, fetch: fetchImpl }).send(NOTE, "+919812345678");
    expect(result).toEqual({ ok: true, providerMessageId: "wamid.ABC" });
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v21.0/1098765/messages");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({ to: "919812345678", type: "template", template: { name: "wonderhome_update", language: { code: "en" } } });
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(["Electricity bill\\ndue", "Rs 2,340 is due on Friday."]);
  });

  it("never tries a number that is not a real international number", async () => {
    const { fetchImpl, calls } = fakeFetch(() => new Response("{}"));
    const adapter = createWhatsAppAdapter({ ...CONFIG, fetch: fetchImpl });
    for (const target of [null, "9812345678", "+0123", "call me"]) {
      expect(await adapter.send(NOTE, target)).toMatchObject({ ok: false, error: { code: "no_target" } });
    }
    expect(calls).toHaveLength(0);
  });

  it("says plainly what went wrong, and only retries what can succeed later", async () => {
    const send = (response: Response) => createWhatsAppAdapter({ ...CONFIG, fetch: fakeFetch(() => response).fetchImpl }).send(NOTE, "+919812345678");
    expect(await send(new Response(JSON.stringify({ error: { code: 131026 } }), { status: 400 }))).toMatchObject({ ok: false, error: { code: "no_target", retryable: false } });
    expect(await send(new Response("", { status: 401 }))).toMatchObject({ ok: false, error: { code: "not_configured", retryable: false } });
    expect(await send(new Response("", { status: 429 }))).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    const offline = createWhatsAppAdapter({ ...CONFIG, fetch: (async () => { throw new Error("socket token=secret"); }) as unknown as typeof fetch });
    const result = await offline.send(NOTE, "+919812345678");
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

describe("the deployment decides whether WhatsApp exists", () => {
  it("needs the token, the number id and a template; otherwise the fixture stays", () => {
    const full = { WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_TEMPLATE_NAME: "x" };
    expect(whatsappConfigFromEnv(full)).not.toBeNull();
    expect(whatsappConfigFromEnv({ ...full, WHATSAPP_TEMPLATE_NAME: "" })).toBeNull();
    expect(channelAdaptersFromEnv({}).whatsapp).toBe(CHANNEL_ADAPTERS.whatsapp);
    expect(channelAdaptersFromEnv(full).whatsapp.live).toBe(true);
    expect(CHANNEL_ADAPTERS.whatsapp.live).toBe(false);
  });
});

describe("reading the webhook", () => {
  it("verifies Meta's signature over the exact body", async () => {
    const body = '{"entry":[]}';
    expect(await verifyWhatsAppSignature(body, await sign(body), SECRET)).toBe(true);
    expect(await verifyWhatsAppSignature(body + " ", await sign(body), SECRET)).toBe(false);
    expect(await verifyWhatsAppSignature(body, await sign(body, "other"), SECRET)).toBe(false);
    expect(await verifyWhatsAppSignature(body, null, SECRET)).toBe(false);
  });

  it("keeps only closed words: statuses, and text from a real number", () => {
    const read = readWhatsAppWebhook({
      entry: [{ changes: [{ value: {
        statuses: [{ id: "wamid.1", status: "read" }, { id: "wamid.2", status: "failed", errors: [{ code: 131047 }] }, { id: "wamid.3", status: "weird" }],
        messages: [{ from: "919812345678", text: { body: "STOP" }, context: { id: "wamid.1" } }, { from: "not-a-number", text: { body: "hi" } }],
      } }] }],
    });
    expect(read.statuses).toEqual([
      { providerMessageId: "wamid.1", status: "read", errorCode: null },
      { providerMessageId: "wamid.2", status: "failed", errorCode: 131047 },
    ]);
    expect(read.messages).toEqual([{ from: "+919812345678", text: "STOP", replyTo: "wamid.1" }]);
  });

  it("recognises a request to stop, and nothing looser", () => {
    for (const text of ["STOP", "stop", " Unsubscribe ", "stop!"]) expect(isOptOut(text)).toBe(true);
    for (const text of ["don't stop reminding me", "stop the milk order", "ok"]) expect(isOptOut(text)).toBe(false);
  });
});

/** A service-role stand-in that records every write. */
function fakeAdmin(tables: Record<string, Record<string, unknown>[]>) {
  const writes: { table: string; op: string; values: unknown }[] = [];
  const client = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const rows = () => (tables[table] ?? []).filter((row) => filters.every(([key, value]) => (key.startsWith("metadata->>") ? (row.metadata as Record<string, unknown>)?.[key.slice(11)] === value : row[key] === value)));
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (key: string, value: unknown) => (filters.push([key, value]), chain),
        neq: (key: string, value: unknown) => (filters.push([key, value === "in_app" ? undefined : value]), chain),
        limit: () => Promise.resolve({ data: rows(), error: null }),
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        insert: (values: unknown) => (writes.push({ table, op: "insert", values }), Promise.resolve({ error: null })),
        update: (values: Record<string, unknown>) => {
          writes.push({ table, op: "update", values });
          const updating: Record<string, unknown> = {
            eq: (key: string, value: unknown) => (filters.push([key, value]), updating),
            select: () => Promise.resolve({ data: rows(), error: null }),
          };
          return updating;
        },
        then: (resolve: (value: unknown) => void) => resolve({ data: (tables[table] ?? []).filter((row) => row.channel !== "in_app"), error: null }),
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, writes };
}

const WA_ENV = { adapter: CONFIG, appSecret: SECRET, verifyToken: "verify-me" };

describe("the webhook", () => {
  it("answers Meta's handshake only for the deployment's own token", async () => {
    const ok = await handleWhatsAppWebhook(new Request("https://app/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"), { config: WA_ENV, admin: () => fakeAdmin({}).client });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    const wrong = await handleWhatsAppWebhook(new Request("https://app/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=1"), { config: WA_ENV, admin: () => fakeAdmin({}).client });
    expect(wrong.status).toBe(401);
  });

  it("refuses unconfigured and unsigned deliveries the same way", async () => {
    const body = '{"entry":[]}';
    const post = (signature: string | null) => new Request("https://app/api/v1/whatsapp/webhook", { method: "POST", body, headers: signature ? { "x-hub-signature-256": signature } : {} });
    expect((await handleWhatsAppWebhook(post(await sign(body)), { config: null, admin: () => fakeAdmin({}).client })).status).toBe(401);
    expect((await handleWhatsAppWebhook(post("sha256=00"), { config: WA_ENV, admin: () => fakeAdmin({}).client })).status).toBe(401);
  });

  it("records a read report once against the notification it belongs to, and honours STOP", async () => {
    const admin = fakeAdmin({
      notification_events: [{ household_id: "h1", notification_id: "n1", channel: "whatsapp", event_type: "sent", metadata: { providerMessageId: "wamid.1" } }],
      notification_preferences: [{ member_id: "m1", channel: "whatsapp", target: "+919812345678", enabled: true }],
    });
    const replies = fakeFetch(() => new Response("{}"));
    const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "read" }, { id: "wamid.unknown", status: "delivered" }], messages: [{ from: "919812345678", text: { body: "STOP" } }] } }] }] });
    const response = await handleWhatsAppWebhook(new Request("https://app/api/v1/whatsapp/webhook", { method: "POST", body, headers: { "x-hub-signature-256": await sign(body) } }), { config: WA_ENV, admin: () => admin.client, fetch: replies.fetchImpl });
    expect(await response.json()).toMatchObject({ recorded: 1, optedOut: 1 });
    expect(admin.writes.find((w) => w.table === "notification_events")?.values).toMatchObject({ notification_id: "n1", event_type: "seen", channel: "whatsapp" });
    expect(admin.writes.find((w) => w.table === "notification_preferences")?.values).toEqual({ enabled: false });
    expect(JSON.parse(replies.calls[0]!.init.body as string)).toMatchObject({ type: "text", to: "919812345678" });
  });
});

describe("delivery from a new notification", () => {
  it("tries only channels that can reach someone, and records what happened in closed words", async () => {
    const admin = fakeAdmin({
      notification_preferences: [
        { channel: "whatsapp", enabled: true, quiet_from: null, quiet_until: null, target: "+919812345678" },
        { channel: "email", enabled: true, quiet_from: null, quiet_until: null, target: null },
      ],
    });
    const whatsapp = createWhatsAppAdapter({ ...CONFIG, fetch: fakeFetch(() => new Response(JSON.stringify({ messages: [{ id: "wamid.9" }] }))).fetchImpl });
    const result = await deliverNotification(
      admin.client,
      { householdId: "h1", notificationId: "n1", recipientMemberId: "m1", notification: NOTE },
      { ...CHANNEL_ADAPTERS, whatsapp },
    );
    expect(result).toEqual({ sent: ["whatsapp"], failed: [] });
    expect(admin.writes[0]?.values).toEqual([{ household_id: "h1", notification_id: "n1", channel: "whatsapp", event_type: "sent", metadata: { providerMessageId: "wamid.9" } }]);
  });

  it("with only fixture channels, writes nothing — it never tried", async () => {
    const admin = fakeAdmin({ notification_preferences: [{ channel: "whatsapp", enabled: true, quiet_from: null, quiet_until: null, target: "+919812345678" }] });
    expect(await deliverNotification(admin.client, { householdId: "h1", notificationId: "n1", recipientMemberId: "m1", notification: NOTE }, CHANNEL_ADAPTERS)).toEqual({ sent: [], failed: [] });
    expect(admin.writes).toEqual([]);
  });
});
