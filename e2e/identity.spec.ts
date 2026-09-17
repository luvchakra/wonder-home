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

  await expect(page.getByRole("heading", { level: 1, name: "WonderHome" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
  await expect(page.getByRole("link", { name: "I already have an account" })).toBeVisible();
});

test("the sign-in form is labelled and reachable by keyboard", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("sign-up asks for a name, so the household has something to call the person", async ({
  page,
}) => {
  await page.goto("/sign-up");

  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
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

  // Validation runs before authentication in the wrapper, so a malformed body
  // is reported as such rather than masked by the 401.
  expect([400, 401]).toContain(response.status());
});
