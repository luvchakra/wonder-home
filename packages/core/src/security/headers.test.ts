import { describe, expect, it } from "vitest";

import { securityHeaders } from "./headers";

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

  it("allows the browser to reach the configured Supabase origin and nothing else", () => {
    const csp = asMap({ development: false, supabaseOrigin: "https://example.supabase.co" })[
      "Content-Security-Policy"
    ];
    expect(csp).toMatch(/connect-src 'self' https:\/\/example\.supabase\.co/);
    expect(csp).not.toContain("ws:");
  });

  it("keeps microphone available for voice but denies camera, geolocation and payment", () => {
    const policy = asMap()["Permissions-Policy"];
    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("camera=()");
    expect(policy).toContain("geolocation=()");
    expect(policy).toContain("payment=()");
  });

  it("does not allow arbitrary embedding or plugins", () => {
    const csp = asMap({ development: false })["Content-Security-Policy"];
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});
