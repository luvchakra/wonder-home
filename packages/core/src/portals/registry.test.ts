import { describe, expect, it } from "vitest";

import type { PortalAdapter } from "./adapter";
import { resolveAdapter } from "./registry";

const stub = (id: string, matches: (url: string) => boolean): PortalAdapter => ({
  id,
  matches,
  isAuthenticated: async () => false,
  login: async () => ({ status: "transient" }),
});

const fallback = stub("generic", () => true);
const loop = stub("loop-learning", (url) => /(^|\.)looplearning\.com/.test(new URL(url).hostname));

describe("resolveAdapter", () => {
  it("prefers the pinned providerId when it exists", () => {
    expect(resolveAdapter({ portalUrl: "https://other.example.com", providerId: "loop-learning", adapters: [loop, fallback], fallback }).id).toBe(
      "loop-learning",
    );
  });

  it("falls through to the first adapter that claims the URL", () => {
    expect(resolveAdapter({ portalUrl: "https://www.looplearning.com/login", adapters: [loop, fallback], fallback }).id).toBe("loop-learning");
  });

  it("uses the generic fallback when nobody claims it", () => {
    expect(resolveAdapter({ portalUrl: "https://new-portal.example.com/login", adapters: [loop, fallback], fallback }).id).toBe("generic");
  });

  it("ignores an unknown providerId and resolves by match", () => {
    expect(resolveAdapter({ portalUrl: "https://www.looplearning.com", providerId: "nope", adapters: [loop, fallback], fallback }).id).toBe(
      "loop-learning",
    );
  });
});
