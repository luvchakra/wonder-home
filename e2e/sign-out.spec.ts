import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { signInThroughForm } from "./sign-in";
import { streamed } from "./streaming";

/**
 * Log out from the avatar menu really signs out (the 2026-11-22 defect: the
 * item was a <form> inside a Radix menu item, the menu unmounted it on select
 * and the browser never posted it, so tapping "Log out" did nothing).
 *
 * Signs a fresh member in, makes their household through the API, opens the
 * avatar menu on Home, taps Log out, and expects the server action's POST, the
 * landing page, no auth cookie, and a gated page that sends them to sign in.
 * Needs a real Supabase project (E2E_SUPABASE_URL, _PUBLISHABLE_KEY,
 * _SERVICE_ROLE_KEY); the member and household are deleted afterwards.
 */

const url = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const E2E_EMAIL_DOMAIN = "e2e.wonderhome-test.internal";
const AUTH_COOKIE = /^sb-.*-auth-token/;

test.describe("Log out from the avatar menu", () => {
  test.skip(!url || !anonKey || !serviceKey, "needs a real Supabase project: E2E_SUPABASE_URL, _PUBLISHABLE_KEY, _SERVICE_ROLE_KEY");

  let admin: SupabaseClient;
  let userId = "";
  const email = `signout-${Date.now()}-${randomBytes(4).toString("hex")}@${E2E_EMAIL_DOMAIN}`;
  const password = `E2e!${randomBytes(18).toString("base64url")}`;

  test.beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "Sign Out" } });
    if (created.error) throw created.error;
    userId = created.data.user.id;
  });

  test.afterAll(async () => {
    if (!userId) return;
    const { data } = await admin.from("household_members").select("household_id").eq("profile_id", userId);
    for (const row of data ?? []) await admin.from("households").delete().eq("id", row.household_id);
    await admin.auth.admin.deleteUser(userId);
  });

  test("Log out signs the member out and gated pages send them to sign in", async ({ page, context }) => {
    await page.goto("/sign-in");
    await signInThroughForm(page, email, password);
    await expect(page).not.toHaveURL(/\/sign-in/);

    const made = await page.request.post("/api/v1/households", { data: { householdName: "Sign Out Home", displayName: "Sign Out" } });
    expect(made.ok(), await made.text()).toBe(true);

    await page.goto("/");
    await streamed(page);
    await page.getByRole("button", { name: /Account menu$/ }).filter({ visible: true }).first().click();
    const logOut = page.getByRole("menuitem", { name: "Log out" });
    await expect(logOut).toBeVisible();

    const posted = page.waitForRequest((request) => request.method() === "POST" && Boolean(request.headers()["next-action"]));
    await logOut.click();
    await posted;

    await expect.poll(async () => (await context.cookies()).filter((cookie) => AUTH_COOKIE.test(cookie.name) && cookie.value).length).toBe(0);
    await expect(page).toHaveURL(/\/$|\/sign-in/);

    await page.goto("/today");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Ftoday/);
  });
});
