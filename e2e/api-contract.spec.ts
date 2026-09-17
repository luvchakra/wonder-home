import { expect, test } from "@playwright/test";

/**
 * /api/v1 contract smoke tests (story 00-007). These run against the built app,
 * so they prove the wrapper behaves in a real request, not only in unit tests.
 */

test("health reports liveness and carries a correlation id", async ({ request }) => {
  const response = await request.get("/api/v1/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["x-request-id"]).toBeTruthy();
  expect(await response.json()).toMatchObject({ status: "ok", version: "v1" });
});

test("health echoes a caller-supplied correlation id", async ({ request }) => {
  const response = await request.get("/api/v1/health", {
    headers: { "x-request-id": "wh-smoke-0001" },
  });

  expect(response.headers()["x-request-id"]).toBe("wh-smoke-0001");
});

test("an authenticated endpoint refuses an anonymous caller in the standard envelope", async ({
  request,
}) => {
  const response = await request.get("/api/v1/me");

  expect(response.status()).toBe(401);

  const payload = await response.json();
  expect(payload.error.code).toBe("unauthenticated");
  expect(payload.error.requestId).toBeTruthy();
  expect(payload.error).not.toHaveProperty("stack");
});
