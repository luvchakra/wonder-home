import { expect, test } from "@playwright/test";

/**
 * The signed-out account surfaces: signing in, asking for a new password,
 * setting one, and the reveal toggle both password fields carry.
 *
 * These run against a real deployment with no test mailbox, so the assertions
 * stop where the email does. What is provable here is everything up to and
 * including the response the person sees — which is exactly where the
 * enumeration risk lives, so it is the part most worth pinning down.
 */

/**
 * The app's own alert.
 *
 * Next.js renders an empty `<div role="alert">` route announcer on every
 * page, so matching the role alone finds that first and waits forever. The
 * Alert component is a paragraph, which tells the two apart.
 */
function alertOf(page: import("@playwright/test").Page) {
  return page.locator('p[role="alert"]');
}

/**
 * Open a form screen and wait for it to be interactive.
 *
 * These forms report what the server said through `useActionState`, which
 * only renders once React has hydrated. Submitting before then still posts —
 * Next.js enhances forms progressively — but the answer has nowhere to
 * appear yet, which showed up as a flake under parallel load.
 */
async function openForm(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test("sign-in offers a way out when the password is forgotten", async ({ page }) => {
  await page.goto("/sign-in");

  const forgot = page.getByRole("link", { name: "Forgot password?" });
  await expect(forgot).toBeVisible();

  await forgot.click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
});

test("asking for a reset says the same thing whether or not the account exists", async ({ page }) => {
  const answers: string[] = [];

  // One address that certainly has no account, and one shaped like a real
  // one. If these two ever differ, the screen has become a way to find out
  // who has an account here.
  for (const email of ["definitely-not-registered-8f2a@example.com", "someone@example.com"]) {
    await openForm(page, "/forgot-password");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();

    const alert = alertOf(page);
    await expect(alert).toBeVisible({ timeout: 15_000 });
    answers.push(((await alert.textContent()) ?? "").trim());
  }

  expect(answers[0]).toBe(answers[1]);
  expect(answers[0]).toContain("If that address has a WonderHome account");
});

test("a malformed address is refused before anything is sent", async ({ page }) => {
  await openForm(page, "/forgot-password");

  // Past the browser's own type=email check, so the server's answer is what
  // is being measured.
  await page.getByLabel("Email address").evaluate((input: HTMLInputElement) => {
    input.type = "text";
    input.value = "not-an-address";
  });
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(alertOf(page)).toContainText("valid email address", { timeout: 15_000 });
});

test("the reset form refuses a link that was never valid", async ({ page }) => {
  await openForm(page, "/reset-password");

  await page.getByLabel("New password", { exact: true }).fill("a-good-long-password");
  await page.getByLabel("Confirm new password").fill("a-good-long-password");
  await page.getByRole("button", { name: "Save new password" }).click();

  // No recovery session was ever established, so Supabase refuses the change
  // and the person is told to ask for a fresh link rather than left guessing.
  await expect(alertOf(page)).toContainText("expired or has already been used", {
    timeout: 15_000,
  });
});

test("the reset form catches two passwords that do not match", async ({ page }) => {
  await openForm(page, "/reset-password");

  await page.getByLabel("New password", { exact: true }).fill("a-good-long-password");
  await page.getByLabel("Confirm new password").fill("a-different-password");
  await page.getByRole("button", { name: "Save new password" }).click();

  await expect(alertOf(page)).toContainText("do not match", { timeout: 15_000 });
});

test("an unusable recovery link lands on sign-in saying so, and never loops", async ({ page }) => {
  await page.goto("/auth/callback?code=not-a-real-code");

  await expect(page).toHaveURL(/\/sign-in\?error=link$/);
  await expect(alertOf(page)).toContainText("expired or has already been used");
});

test("the callback refuses to forward to another site", async ({ page }) => {
  // An open redirect here would let a phishing link finish its journey on
  // WonderHome's own domain.
  await page.goto("/auth/callback?next=https%3A%2F%2Fexample.com%2Fphish");

  expect(new URL(page.url()).origin).toBe(new URL(page.url()).origin);
  await expect(page).toHaveURL(/\/sign-in\?error=link$/);
});

for (const [screen, path, field] of [
  ["sign-in", "/sign-in", "Password"],
  ["sign-up", "/sign-up", "Password"],
] as const) {
  test(`${screen} lets you read the password you typed`, async ({ page }) => {
    await openForm(page, path);

    const input = page.getByLabel(field, { exact: true });
    await input.fill("hunter2-but-longer");

    // Hidden by default: revealing is a deliberate act, every time.
    await expect(input).toHaveAttribute("type", "password");

    const toggle = page.getByRole("button", { name: "Show password" });
    await toggle.click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("hunter2-but-longer");

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(input).toHaveAttribute("type", "password");
  });
}

test("no dead Google button appears while Google is not configured", async ({ page }) => {
  for (const path of ["/sign-in", "/sign-up"]) {
    await page.goto(path);
    // The rule from design/DESIGN-NOTES.md: a button that goes nowhere is
    // worse than none. It appears the day the deployment configures Google.
    await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
  }
});
