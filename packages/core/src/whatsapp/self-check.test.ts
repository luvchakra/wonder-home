import { afterEach, describe, expect, it, vi } from "vitest";

import { handleWhatsAppWebhook, resetNotConfiguredClock } from "../notifications/whatsapp-webhook";
import {
  checkAccessToken,
  checkAppSubscription,
  checkWabaSubscription,
  checkWebhookSelfTest,
  selfTestBody,
  settingsLine,
  signWhatsAppBody,
  summaryLine,
} from "./self-check";

const URL_ = "https://home.wonderapps.biz/api/v1/whatsapp/webhook";
const SECRET = "test-app-secret-1234567890";

function answer(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

afterEach(() => resetNotConfiguredClock());

describe("Test WhatsApp: the self-test delivery", () => {
  it("is accepted with 200 and creates nothing: no event, no message, no job, no reply", async () => {
    const touched: string[] = [];
    const admin = () => ({ from: (table: string) => (touched.push(table), { insert: async () => ({ error: null }) }) }) as never;
    const defer = vi.fn();
    const ask = vi.fn();
    const body = selfTestBody("n-1");
    const request = new Request(URL_, { method: "POST", body, headers: { "x-hub-signature-256": await signWhatsAppBody(body, SECRET) } });
    const config = { adapter: {} as never, appSecret: SECRET, verifyToken: "v" };
    const response = await handleWhatsAppWebhook(request, { config, admin, defer, ask });
    expect(response.status).toBe(200);
    expect(touched).toEqual([]);
    expect(defer).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
  });

  it("is refused unsigned or signed with another secret, like any delivery", async () => {
    const admin = () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) as never;
    const body = selfTestBody("n-2");
    const config = { adapter: {} as never, appSecret: SECRET, verifyToken: "v" };
    const wrong = new Request(URL_, { method: "POST", body, headers: { "x-hub-signature-256": await signWhatsAppBody(body, "another-secret-000000") } });
    expect((await handleWhatsAppWebhook(wrong, { config, admin })).status).toBe(401);
  });

  it("reads 200 as working and 401 as a config mismatch", async () => {
    expect((await checkWebhookSelfTest({ webhookUrl: URL_, appSecret: SECRET, fetch: answer(200, { ok: true }) })).ok).toBe(true);
    const refused = await checkWebhookSelfTest({ webhookUrl: URL_, appSecret: SECRET, fetch: answer(401, {}) });
    expect(refused.ok).toBe(false);
    expect(refused.title).toMatch(/refused/);
  });
});

describe("Test WhatsApp: the checks", () => {
  it("names missing settings and where each comes from", () => {
    const line = settingsLine([
      { key: "WHATSAPP_ACCESS_TOKEN", label: "WhatsApp access token", source: "saved", required: true },
      { key: "WHATSAPP_APP_SECRET", label: "WhatsApp app secret", source: "unset", required: true },
      { key: "WHATSAPP_TEMPLATE_NAME", label: "WhatsApp message template", source: "environment", required: true },
    ]);
    expect(line.ok).toBe(false);
    expect(line.title).toBe("Missing: WhatsApp app secret");
    expect(line.detail).toContain("WhatsApp message template: Vercel");
  });

  it("shows Meta's number and name, and a mismatch with the saved business number", async () => {
    const fetch = answer(200, { display_phone_number: "+91 98000 00001", verified_name: "WonderHome", quality_rating: "GREEN" });
    const good = await checkAccessToken({ accessToken: "t".repeat(30), phoneNumberId: "123", businessNumber: "+919800000001", fetch });
    expect(good).toMatchObject({ ok: true, title: "Access token valid" });
    const other = await checkAccessToken({ accessToken: "t".repeat(30), phoneNumberId: "123", businessNumber: "+919800000002", fetch });
    expect(other.ok).toBe(false);
  });

  it("says an expired token in plain words, and never echoes the token", async () => {
    const token = "EAAG-secret-token-value-XYZ";
    const line = await checkAccessToken({ accessToken: token, phoneNumberId: "123", businessNumber: null, fetch: answer(401, { error: { code: 190, error_subcode: 463 } }) });
    expect(line.detail).toMatch(/expired or invalid/);
    expect(JSON.stringify(line)).not.toContain(token);
  });

  it("finds a wrong callback URL and an unticked messages field", async () => {
    const fetch = answer(200, { data: [{ object: "whatsapp_business_account", callback_url: "https://old.example/hook", active: true, fields: [{ name: "account_update" }] }] });
    const line = await checkAppSubscription({ appId: "42", appSecret: SECRET, expectedUrl: URL_, fetch });
    expect(line.ok).toBe(false);
    expect(line.detail).toContain("Meta is sending to a different URL: https://old.example/hook");
    expect(line.detail).toContain("messages field not subscribed");
    expect(JSON.stringify(line)).not.toContain(SECRET);
  });

  it("is right when the URL matches, active, messages ticked", async () => {
    const fetch = answer(200, { data: [{ object: "whatsapp_business_account", callback_url: URL_, active: true, fields: ["messages"] }] });
    expect((await checkAppSubscription({ appId: "42", appSecret: SECRET, expectedUrl: URL_, fetch })).ok).toBe(true);
  });

  it("checks the business account sends to this app", async () => {
    const none = await checkWabaSubscription({ wabaId: "9", appId: "42", accessToken: "t".repeat(30), expectedUrl: URL_, fetch: answer(200, { data: [] }) });
    expect(none.ok).toBe(false);
    const ours = await checkWabaSubscription({ wabaId: "9", appId: "42", accessToken: "t".repeat(30), expectedUrl: URL_, fetch: answer(200, { data: [{ whatsapp_business_api_data: { id: "42", name: "WonderHome" } }] }) });
    expect(ours.ok).toBe(true);
  });

  it("a check without its id is skipped, not failed", async () => {
    const fetch = vi.fn();
    expect((await checkAppSubscription({ appId: null, appSecret: SECRET, expectedUrl: URL_, fetch })).ok).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(summaryLine([{ id: "a", ok: true, title: "", detail: "" }, { id: "b", ok: null, title: "", detail: "" }]).ok).toBe(true);
  });

  it("an unreachable Meta is a timeout line, not a crash", async () => {
    const fetch = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const line = await checkAccessToken({ accessToken: "t".repeat(30), phoneNumberId: "123", businessNumber: null, fetch });
    expect(line.detail).toMatch(/didn't answer in time/);
  });
});
