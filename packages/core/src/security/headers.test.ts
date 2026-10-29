import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, contentSecurityPolicyHeaders, cspModeFromEnv, securityHeaders } from "./headers";

function asMap(options?: Parameters<typeof securityHeaders>[0]) {
  return Object.fromEntries(securityHeaders(options).map((h) => [h.key, h.value]));
}

describe("security headers", () => {
  it("refuses framing and sniffing on every response", () => {
    const headers = asMap({ development: false });
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("sends HSTS in production only", () => {
    expect(asMap({ development: false })).toHaveProperty("Strict-Transport-Security");
    expect(asMap({ development: true })).not.toHaveProperty("Strict-Transport-Security");
  });

  it("allows the browser to reach the configured Supabase origin and the Gemini Live socket, and nothing else", () => {
    const csp = buildContentSecurityPolicy({ development: false, supabaseOrigin: "https://example.supabase.co", nonce: "abc" });
    expect(csp).toMatch(/connect-src 'self' https:\/\/example\.supabase\.co wss:\/\/generativelanguage\.googleapis\.com;/);
    expect(csp).not.toMatch(/connect-src[^;]* ws:/);
  });

  it("keeps microphone and geolocation to WonderHome's own pages, and denies camera and payment", () => {
    const policy = asMap()["Permissions-Policy"];
    expect(policy).toContain("microphone=(self)");
    // Location sharing (01-014) asks the browser only from our own origin, never from a frame.
    expect(policy).toContain("geolocation=(self)");
    expect(policy).not.toContain("geolocation=*");
    expect(policy).toContain("camera=()");
    expect(policy).toContain("payment=()");
  });

  it("does not allow arbitrary embedding or plugins", () => {
    for (const nonce of [undefined, "abc"]) {
      const csp = buildContentSecurityPolicy({ development: false, nonce });
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("upgrade-insecure-requests");
    }
  });

  it("strict policy: scripts need the nonce, no 'unsafe-inline' or 'unsafe-eval' in script-src", () => {
    const script = buildContentSecurityPolicy({ development: false, nonce: "abc" }).match(/script-src ([^;]*)/)![1];
    expect(script).toBe("'self' 'nonce-abc' 'strict-dynamic'");
  });

  it("report-only mode: the static header enforces the old policy, the middleware only reports the strict one", () => {
    expect(asMap({ development: false, cspMode: "report-only" })["Content-Security-Policy"]).toContain("script-src 'self' 'unsafe-inline'");
    const ro = contentSecurityPolicyHeaders("n1", "report-only", { development: false });
    // No enforcing header from the middleware: Next would copy it over the request's and lose the nonce.
    expect(ro.response.map((h) => h.key)).toEqual(["Content-Security-Policy-Report-Only"]);
    expect(ro.response[0]!.value).toContain("'nonce-n1'");
    expect(ro.request.key).toBe("Content-Security-Policy-Report-Only");
  });

  it("enforce mode: the middleware enforces the strict policy and the static header steps aside", () => {
    expect(asMap({ development: false, cspMode: "enforce" })).not.toHaveProperty("Content-Security-Policy");
    const en = contentSecurityPolicyHeaders("n1", "enforce", { development: false });
    expect(en.response).toHaveLength(1);
    expect(en.response[0]!.key).toBe("Content-Security-Policy");
    expect(en.response[0]!.value).toContain("'nonce-n1'");
    expect(cspModeFromEnv("enforce")).toBe("enforce");
    expect(cspModeFromEnv(undefined)).toBe("report-only");
  });
});
