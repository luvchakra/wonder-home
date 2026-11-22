import { afterEach, describe, expect, it, vi } from "vitest";

import { handleWhatsAppWebhook, recordNotConfigured, resetNotConfiguredClock } from "./whatsapp-webhook";

/** A day of silent 401s (2026-11-21/22): a refusal for a missing setting now leaves a `not_configured` event. */
function fakeAdmin() {
  const inserted: unknown[] = [];
  const client = { from: () => ({ insert: async (rows: unknown[]) => (inserted.push(...rows), { error: null }) }) };
  return { inserted, admin: () => client as never };
}

afterEach(() => resetNotConfiguredClock());

describe("WhatsApp webhook without its settings", () => {
  it("refuses with 401 and records not_configured once", async () => {
    const { inserted, admin } = fakeAdmin();
    const post = () => new Request("https://home.example/api/v1/whatsapp/webhook", { method: "POST", body: "{}" });
    expect((await handleWhatsAppWebhook(post(), { config: null, admin })).status).toBe(401);
    expect((await handleWhatsAppWebhook(post(), { config: null, admin })).status).toBe(401);
    expect(inserted).toEqual([{ kind: "not_configured", household_id: null, latency_ms: null }]);
  });

  it("also when only the app secret is missing", async () => {
    const { inserted, admin } = fakeAdmin();
    const config = { adapter: {} as never, appSecret: null, verifyToken: "v" };
    const response = await handleWhatsAppWebhook(new Request("https://home.example/x", { method: "POST", body: "{}" }), { config, admin });
    expect(response.status).toBe(401);
    expect(inserted).toHaveLength(1);
  });

  it("is rate-limited to one a minute, and never throws without a service role", async () => {
    const throwing = vi.fn(() => {
      throw new Error("no service role");
    });
    expect(await recordNotConfigured(throwing, 1_000)).toBe(true);
    expect(await recordNotConfigured(throwing, 30_000)).toBe(false);
    expect(await recordNotConfigured(throwing, 61_001)).toBe(true);
  });
});
