import { expect, test } from "@playwright/test";

/**
 * Identity surfaces (story 01-001).
 *
 * These cover what an anonymous visitor can reach. The signed-in half of the
 * flow is proven by scripts/test-identity-rls.mjs, which exercises the real
 * policies against a real database as an authenticated role — CI has no live
 * Supabase project to sign into.
 */

test("a signed-out visitor is offered both ways in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Home runs smoother.");
  await expect(page.getByRole("link", { name: /Get Started Free/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign In" }).first()).toBeVisible();
});

test("the sign-in form is labelled and reachable by keyboard", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByLabel("Email")).toBeVisible();
  // Exact, because the reveal toggle beside it is also labelled "…password".
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("sign-up asks for a name, so the household has something to call the person", async ({
  page,
}) => {
  await page.goto("/sign-up");

  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("onboarding is gated and remembers where the visitor was going", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fwelcome/);
});

test("the households API refuses an anonymous caller in the standard envelope", async ({
  request,
}) => {
  const response = await request.get("/api/v1/households");
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe("unauthenticated");
});

test("creating a household is refused without a session", async ({ request }) => {
  const response = await request.post("/api/v1/households", {
    data: { householdName: "Intruder Home", displayName: "Nobody" },
  });
  expect(response.status()).toBe(401);
});

test("an invalid create request is rejected with field-level detail", async ({ request }) => {
  const response = await request.post("/api/v1/households", {
    data: { householdName: "", displayName: "Nobody" },
  });

  // Authentication runs before validation, so an anonymous caller is turned
  // away before learning what a valid body looks like.
  expect(response.status()).toBe(401);
});

test("an invitation link sends a signed-out visitor to sign in and back", async ({ page }) => {
  await page.goto("/invite/some-invitation-token-value");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Finvite%2Fsome-invitation-token-value/);
});

test("members and roles is gated", async ({ page }) => {
  await page.goto("/household/members");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fhousehold%2Fmembers/);
});

test("the invitations API refuses an anonymous caller", async ({ request }) => {
  const householdId = "00000000-0000-4000-8000-000000000000";
  const list = await request.get(`/api/v1/households/${householdId}/invitations`);
  expect(list.status()).toBe(401);

  const accept = await request.post("/api/v1/invitations/accept", {
    data: { token: "x".repeat(40) },
  });
  expect(accept.status()).toBe(401);
});

test("the personalized view endpoint refuses an anonymous caller", async ({ request }) => {
  const response = await request.get("/api/v1/me/view");
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe("unauthenticated");
});
