import { describe, expect, it } from "vitest";

import { ApiError } from "./errors";
import { defineRoute } from "./route";

describe("a rate-limited API answer", () => {
  it("is a 429 that says when to try again", async () => {
    const handler = defineRoute({}, async () => {
      throw ApiError.rateLimited("Pausing for a minute.", 90);
    });
    const response = await handler(new Request("https://example.invalid/api/v1/x"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("90");
    expect((await response.json()).error.code).toBe("rate_limited");
  });

  it("falls back to a minute when the refusal names no wait", async () => {
    const handler = defineRoute({}, async () => {
      throw new ApiError("rate_limited", "Too many.");
    });
    expect((await handler(new Request("https://example.invalid/api/v1/x"))).headers.get("retry-after")).toBe("60");
  });
});
