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

test("the API describes itself, without exposing household content", async ({ request }) => {
  const response = await request.get("/api/v1/openapi");
  expect(response.status()).toBe(200);

  const document = await response.json();
  expect(document.openapi).toBe("3.1.0");
  expect(document.info.version).toBe("v1");
  expect(document.paths).toHaveProperty("/households");
  expect(document.paths).toHaveProperty("/invitations/accept");

  // A description of shapes, not of any household's data.
  expect(JSON.stringify(document)).not.toMatch(/chakraborty|@example|token_hash/i);
});

test("an idempotency key is rejected when it is too short to be unique", async ({ request }) => {
  const householdId = "00000000-0000-4000-8000-000000000000";
  const response = await request.post(`/api/v1/households/${householdId}/invitations`, {
    headers: { "idempotency-key": "short" },
    data: { email: "a@b.test", displayName: "A" },
  });

  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("bad_request");
});
