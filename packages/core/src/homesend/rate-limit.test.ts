import { describe, expect, it } from "vitest";

import { clientIpFromHeaders, hashClientIp, mayCreateShareHandoff, SHARE_HANDOFF_RATE_LIMIT } from "./rate-limit";

describe("mayCreateShareHandoff", () => {
  it("allows a caller under the limit", () => {
    expect(mayCreateShareHandoff(0)).toEqual({ allowed: true });
    expect(mayCreateShareHandoff(SHARE_HANDOFF_RATE_LIMIT.maxPerWindow - 1)).toEqual({ allowed: true });
  });

  it("refuses once the caller reaches the limit", () => {
    expect(mayCreateShareHandoff(SHARE_HANDOFF_RATE_LIMIT.maxPerWindow)).toEqual({
      allowed: false,
      retryAfterMinutes: SHARE_HANDOFF_RATE_LIMIT.windowMinutes,
    });
  });

  it("stays refused further over the limit", () => {
    const result = mayCreateShareHandoff(SHARE_HANDOFF_RATE_LIMIT.maxPerWindow + 50);
    expect(result.allowed).toBe(false);
  });
});

describe("hashClientIp", () => {
  it("is deterministic for the same address", () => {
    expect(hashClientIp("203.0.113.7")).toBe(hashClientIp("203.0.113.7"));
  });

  it("differs for different addresses", () => {
    expect(hashClientIp("203.0.113.7")).not.toBe(hashClientIp("203.0.113.8"));
  });

  it("never returns the address itself", () => {
    expect(hashClientIp("203.0.113.7")).not.toContain("203.0.113.7");
  });

  it("trims surrounding whitespace before hashing, so a stray space doesn't split one caller into two", () => {
    expect(hashClientIp("203.0.113.7")).toBe(hashClientIp(" 203.0.113.7 "));
  });
});

describe("clientIpFromHeaders", () => {
  it("reads the first address from x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when there is no x-forwarded-for", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.7" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
  });

  it("prefers x-forwarded-for over x-real-ip when both are present", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "70.41.3.18" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
  });

  it("returns null when neither header is present", () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});
