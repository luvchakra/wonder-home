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

test("authentication is settled before anything about the request is judged", async ({ request }) => {
  // A malformed idempotency key and a malformed body are both grounds for a
  // 400 — for a caller who has a session. An anonymous caller is turned away
  // first, so probing this endpoint teaches nothing about its rules. The rules
  // themselves are covered in packages/core/src/api/idempotency.test.ts.
  const householdId = "00000000-0000-4000-8000-000000000000";
  const response = await request.post(`/api/v1/households/${householdId}/invitations`, {
    headers: { "idempotency-key": "short" },
    data: { email: "not-an-email", displayName: "" },
  });

  expect(response.status()).toBe(401);

  const payload = await response.json();
  expect(payload.error.code).toBe("unauthenticated");
  expect(payload.error).not.toHaveProperty("details");
});

test("readiness reports each dependency without describing the deployment", async ({ request }) => {
  const response = await request.get("/api/v1/health/ready");

  // 200 while serving, 503 only when a dependency is down.
  expect([200, 503]).toContain(response.status());

  const report = await response.json();
  expect(["ok", "degraded", "down"]).toContain(report.status);
  expect(report.checks.map((check: { name: string }) => check.name)).toContain("database");

  // Names and timings only: no host, no credential, no driver message.
  const serialized = JSON.stringify(report);
  expect(serialized).not.toMatch(/supabase\.co|postgres|password|key/i);
});

test("the platform admin boundary does not admit a household session", async ({ request }) => {
  // 404 rather than 403: confirming the boundary exists would tell a caller
  // where to point the next attempt.
  const operations = await request.get("/api/v1/platform-admin/operations");
  expect([401, 404]).toContain(operations.status());

  const grant = await request.post("/api/v1/platform-admin/support-access", {
    data: {
      householdId: "00000000-0000-4000-8000-000000000000",
      reasonCode: "user_reported_issue",
      reasonNote: "An anonymous caller should never reach this",
    },
  });
  expect([401, 404]).toContain(grant.status());
});
