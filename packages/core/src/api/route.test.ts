// lint-secrets: fixtures — the credential-shaped values below are fakes,
// present precisely to prove they are redacted rather than logged.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError } from "./errors";
import { defineRoute } from "./route";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://wonderhome.test/api/v1/example", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("defineRoute", () => {
  it("returns validated data and echoes a correlation id", async () => {
    const route = defineRoute({ input: z.object({ name: z.string().min(1) }) }, ({ body, requestId }) => ({
      greeted: body.name,
      requestId,
    }));

    const response = await route(post({ name: "Kunal" }, { "x-request-id": "req-abc-123" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req-abc-123");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ greeted: "Kunal", requestId: "req-abc-123" });
  });

  it("rejects a malformed body with the standard envelope", async () => {
    const route = defineRoute({ input: z.object({ name: z.string() }) }, () => ({ ok: true }));

    const response = await route(post("{not json"));
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error.code).toBe("bad_request");
    expect(payload.error.requestId).toEqual(expect.any(String));
  });

  it("reports field-level validation problems without echoing the values", async () => {
    const route = defineRoute({ input: z.object({ name: z.string().min(2) }) }, () => ({ ok: true }));

    const payload = await (await route(post({ name: "" }))).json();

    expect(payload.error.code).toBe("bad_request");
    expect(payload.error.details).toHaveProperty("name");
    expect(JSON.stringify(payload)).not.toContain('"value"');
  });

  it("passes an ApiError through with its status and message", async () => {
    const route = defineRoute({}, () => {
      throw ApiError.forbidden("Only a Household Administrator can change responsibilities.");
    });

    const response = await route(new Request("https://wonderhome.test/api/v1/example"));
    expect(response.status).toBe(403);

    const payload = await response.json();
    expect(payload.error.code).toBe("forbidden");
    expect(payload.error.message).toMatch(/Household Administrator/);
  });

  it("never leaks an unexpected error's message or stack", async () => {
    const route = defineRoute({}, () => {
      throw new Error("connection string postgres://user:hunter2@db/internal failed");
    });

    const response = await route(new Request("https://wonderhome.test/api/v1/example"));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("postgres://");
    expect(JSON.parse(text).error.code).toBe("internal");
  });

  it("ignores an inbound request id that is not safe to echo", async () => {
    const route = defineRoute({}, ({ requestId }) => ({ requestId }));

    const response = await route(
      new Request("https://wonderhome.test/api/v1/example", {
        headers: { "x-request-id": "<script>alert(1)</script>" },
      }),
    );

    const payload = await response.json();
    expect(payload.requestId).not.toContain("<script>");
    expect(payload.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses an anonymous caller before it reads the body, not after", async () => {
    // Validation detail describes the API. A caller who cannot authenticate has
    // not earned that description, and the order of these two steps is the only
    // thing that decides which they get.
    let bodyWasRead = false;
    const route = defineRoute(
      {
        input: z.object({ amountMinor: z.number().int().positive() }),
        authenticate: async () => {
          throw ApiError.unauthenticated();
        },
      },
      () => {
        bodyWasRead = true;
        return {};
      },
    );

    const response = await route(
      new Request("https://wonderhome.test/api/v1/example", {
        method: "POST",
        body: JSON.stringify({ amountMinor: "not a number" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("unauthenticated");
    expect(payload.error).not.toHaveProperty("details");
    expect(bodyWasRead).toBe(false);
  });

  it("hands the handler whoever authenticated, so it is not looked up twice", async () => {
    const route = defineRoute(
      { authenticate: async () => ({ userId: "kunal" }) },
      ({ actor }) => ({ seen: actor.userId }),
    );

    const response = await route(new Request("https://wonderhome.test/api/v1/example"));

    expect(await response.json()).toEqual({ seen: "kunal" });
  });
});
