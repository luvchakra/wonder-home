import { describe, expect, it } from "vitest";

import { checkCsrf, configuredHosts } from "./csrf";

const ME = "home.wonderapps.biz";
const call = (method: string, pathname: string, headers: Record<string, string> = {}, extraHosts: string[] = []) =>
  checkCsrf({ method, pathname, headers: new Headers({ host: ME, ...headers }), extraHosts });

describe("CSRF origin check (SEC-09)", () => {
  const cookie = { cookie: "sb-x-auth-token=abc" };

  it("lets safe methods through whatever the origin", () => {
    expect(call("GET", "/api/v1/households", { ...cookie, origin: "https://evil.example" }).allowed).toBe(true);
  });

  it("allows a same-origin mutation", () => {
    expect(call("POST", "/api/v1/households", { ...cookie, origin: `https://${ME}` }).allowed).toBe(true);
    expect(call("DELETE", "/api/v1/households/h/webhooks/w", { ...cookie, referer: `https://${ME}/settings` }).allowed).toBe(true);
  });

  it("refuses a cross-origin or opaque-origin mutation that carries the cookie", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(call(method, "/api/v1/households", { ...cookie, origin: "https://evil.example" })).toEqual({ allowed: false, reason: "origin_mismatch" });
    }
    expect(call("POST", "/api/v1/households", { ...cookie, origin: "null" }).allowed).toBe(false);
    expect(call("POST", "/api/v1/households", { ...cookie, referer: "https://evil.example/x" })).toEqual({ allowed: false, reason: "referer_mismatch" });
    expect(call("POST", "/api/v1/households", { ...cookie, "sec-fetch-site": "cross-site" })).toEqual({ allowed: false, reason: "cross_site" });
  });

  it("does not take a look-alike host for ours", () => {
    expect(call("POST", "/x", { ...cookie, origin: `https://${ME}.evil.example` }).allowed).toBe(false);
  });

  it("accepts the configured site and deployment hosts", () => {
    expect(call("POST", "/x", { ...cookie, origin: "https://alias.example" }, ["alias.example"]).allowed).toBe(true);
    expect(configuredHosts({ NEXT_PUBLIC_SITE_URL: "https://a.example/", VERCEL_URL: "b.vercel.app" })).toEqual(["a.example", "b.vercel.app"]);
  });

  it("does not apply to bearer-token callers, cookie-less callers or non-browser clients", () => {
    expect(call("POST", "/api/v1/households", { ...cookie, authorization: "Bearer t", origin: "https://evil.example" }).allowed).toBe(true);
    expect(call("POST", "/api/v1/households", { origin: "https://evil.example" }).allowed).toBe(true);
    expect(call("POST", "/api/v1/households", cookie).allowed).toBe(true);
  });

  it("exempts signature, secret, token and key authenticated routes, explicitly", () => {
    const foreign = { ...cookie, origin: "https://evil.example" };
    for (const path of [
      "/api/v1/whatsapp/webhook",
      "/api/v1/billing/webhook",
      "/api/v1/billing/webhook/razorpay",
      "/api/v1/homesend/email/webhook",
      "/api/v1/platform/retention",
      "/api/v1/platform/webhook-delivery",
      "/api/v1/notifications/dispatch",
      "/api/v1/calendar/subscriptions/sync",
      "/api/v1/notifications/email-off",
      "/api/v1/oauth/voice/token",
      "/api/v1/voice/alexa",
      "/api/v1/partner/groceries",
      "/api/v1/security/csp-report",
    ]) {
      expect(call("POST", path, foreign).allowed, path).toBe(true);
    }
  });

  it("does not exempt cookie routes that sit near an exempt one", () => {
    expect(call("POST", "/api/v1/platform-admin/support-access", { ...cookie, origin: "https://evil.example" }).allowed).toBe(false);
    expect(call("POST", "/api/v1/notifications/preferences", { ...cookie, origin: "https://evil.example" }).allowed).toBe(false);
  });

  it("keeps the share target working when a browser omits Origin, and still refuses a foreign one", () => {
    expect(call("POST", "/api/v1/intake/share", { ...cookie, "sec-fetch-site": "cross-site" }).allowed).toBe(true);
    expect(call("POST", "/api/v1/intake/share", { ...cookie, origin: `https://${ME}` }).allowed).toBe(true);
    expect(call("POST", "/api/v1/intake/share", { ...cookie, origin: "https://evil.example" }).allowed).toBe(false);
  });
});
