import { describe, expect, it } from "vitest";

import { HANDLER_CACHE_EXCEPTIONS, NO_STORE, isNonShared, publicFileCacheHeaders, responseCacheHeaders } from "./cache-policy";

describe("isNonShared", () => {
  it("accepts only values no CDN or proxy may store", () => {
    expect(isNonShared(NO_STORE)).toBe(true);
    expect(isNonShared("private, no-cache, no-store, max-age=0, must-revalidate")).toBe(true);
    expect(isNonShared("private, max-age=300")).toBe(true);
    expect(isNonShared("no-store")).toBe(true);
    expect(isNonShared("public, max-age=300")).toBe(false);
    expect(isNonShared("private, s-maxage=60")).toBe(false);
    expect(isNonShared("max-age=60")).toBe(false);
    expect(isNonShared("")).toBe(false);
    expect(isNonShared(null)).toBe(false);
  });
});

describe("responseCacheHeaders", () => {
  it("marks a page or API answer private and varying by cookie", () => {
    const headers = Object.fromEntries(responseCacheHeaders("/today").map(({ key, value }) => [key, value]));
    expect(headers["Cache-Control"]).toBe(NO_STORE);
    expect(headers.Vary).toBe("Cookie");
  });

  it("keeps the response's own Vary and adds Cookie once", () => {
    const vary = (existing: string) => responseCacheHeaders("/meals", existing).find(({ key }) => key === "Vary")?.value;
    expect(vary("rsc, next-router-state-tree")).toBe("rsc, next-router-state-tree, Cookie");
    expect(vary("Accept-Encoding, cookie")).toBe("Accept-Encoding, cookie");
  });

  it("leaves only the listed handlers their own header", () => {
    expect(responseCacheHeaders("/api/v1/openapi")).toEqual([]);
    expect(responseCacheHeaders("/e/abc123/card")).toEqual([]);
    expect(responseCacheHeaders("/meals/recipe-card/r1")).toEqual([]);
    // Near misses are not exceptions.
    expect(responseCacheHeaders("/api/v1/openapi/extra")).not.toEqual([]);
    expect(responseCacheHeaders("/e/abc123")).not.toEqual([]);
    expect(responseCacheHeaders("/api/v1/households/h1/conversation")).not.toEqual([]);
  });

  it("says why each exception is safe", () => {
    for (const { why } of HANDLER_CACHE_EXCEPTIONS) expect(why.length).toBeGreaterThan(40);
  });
});

describe("publicFileCacheHeaders", () => {
  const byPath = new Map(publicFileCacheHeaders().map(({ source, headers }) => [source, headers[0]!.value]));

  it("never marks an unhashed file immutable, and always revalidates the service worker", () => {
    for (const value of byPath.values()) expect(value).not.toContain("immutable");
    expect(byPath.get("/sw.js")).toBe("no-cache");
  });

  it("matches the icons, the share card and the brand images", () => {
    const iconSource = [...byPath.keys()].find((source) => source.startsWith("/:file("))!;
    const pattern = new RegExp(`^/${iconSource.slice("/:file(".length, -1)}$`);
    for (const file of ["/icon-192.png", "/icon-512-dark.png", "/icon.svg", "/icon-maskable-512.png", "/apple-touch-icon.png", "/og.png"]) {
      expect(pattern.test(file), file).toBe(true);
    }
    for (const page of ["/today", "/icons/page", "/api/v1/me"]) expect(pattern.test(page), page).toBe(false);
  });
});
