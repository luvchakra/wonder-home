import { afterEach, describe, expect, it } from "vitest";

import { authenticatePartner, developerApiEnabled, generateKey, hashKey, keyFromHeader, keyIsUsable, keyPrefix, requireScope } from "./keys";

const untouched = new Proxy({}, { get: () => { throw new Error("must not touch the database"); } }) as never;

afterEach(() => {
  delete process.env.WONDERHOME_DEVELOPER_API;
});

describe("a partner key", () => {
  it("is 40 random characters behind its environment, and never repeats", () => {
    const live = generateKey("live");
    const test = generateKey("sandbox");
    expect(live).toMatch(/^whk_live_[A-Za-z0-9]{40}$/);
    expect(test).toMatch(/^whk_test_[A-Za-z0-9]{40}$/);
    expect(new Set(Array.from({ length: 200 }, () => generateKey("live"))).size).toBe(200);
  });

  it("is kept only as a hash, recognised by a short prefix", () => {
    const key = generateKey("live");
    expect(hashKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey(key)).toBe(hashKey(key));
    expect(keyPrefix(key)).toMatch(/^whk_live_[A-Za-z0-9]{4}$/);
    expect(key.startsWith(keyPrefix(key))).toBe(true);
  });

  it("is read only from a Bearer header of exactly its shape", () => {
    const key = generateKey("sandbox");
    expect(keyFromHeader(`Bearer ${key}`)).toBe(key);
    expect(keyFromHeader(`bearer ${key}`)).toBe(key);
    expect(keyFromHeader(key)).toBeNull();
    expect(keyFromHeader(`Bearer ${key}x`)).toBeNull();
    expect(keyFromHeader("Bearer whk_live_short")).toBeNull();
    expect(keyFromHeader(null)).toBeNull();
  });

  it("stops working once revoked or past its expiry", () => {
    const now = new Date("2026-09-25T10:00:00Z");
    expect(keyIsUsable({ revoked_at: null, expires_at: null }, now)).toBe(true);
    expect(keyIsUsable({ revoked_at: null, expires_at: "2026-09-26T00:00:00Z" }, now)).toBe(true);
    expect(keyIsUsable({ revoked_at: null, expires_at: "2026-09-25T09:59:59Z" }, now)).toBe(false);
    expect(keyIsUsable({ revoked_at: "2026-09-20T00:00:00Z", expires_at: null }, now)).toBe(false);
  });

  it("does only what its scopes say", () => {
    const actor = { keyId: "k", householdId: "h", environment: "live" as const, scopes: ["groceries.read" as const] };
    expect(() => requireScope(actor, "groceries.read")).not.toThrow();
    expect(() => requireScope(actor, "groceries.write")).toThrow(/groceries.write/);
  });
});

describe("authenticating a partner", () => {
  it("is off unless the deployment switches it on, and then no key is valid — the same 401, nothing read", async () => {
    expect(developerApiEnabled({})).toBe(false);
    expect(developerApiEnabled({ WONDERHOME_DEVELOPER_API: "on" })).toBe(true);
    await expect(authenticatePartner(untouched, new Request("https://x.test", { headers: { authorization: `Bearer ${generateKey("live")}` } }))).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("answers a missing, malformed or unknown key with the same 401", async () => {
    process.env.WONDERHOME_DEVELOPER_API = "on";
    const nobody = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } as never;
    for (const header of [null, "Bearer nope", `Bearer ${generateKey("live")}`]) {
      const request = new Request("https://x.test", header ? { headers: { authorization: header } } : {});
      await expect(authenticatePartner(nobody, request)).rejects.toMatchObject({ code: "unauthenticated", message: "A valid partner key is required." });
    }
  });
});
