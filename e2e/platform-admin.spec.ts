import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { streamed } from "./streaming";

/**
 * The platform admin portal (16-010).
 *
 * Signed out, every section sends the visitor home without saying the portal
 * exists. Signed in as an operator, the sidebar reaches every section the role
 * may open, Secrets is not among them, and one setting can be changed and put
 * back. The setting edited is the WhatsApp template language, saved as the
 * value it already has and then cleared, so the run changes nothing a
 * household would notice. That half needs a real Supabase project
 * (E2E_SUPABASE_URL, _PUBLISHABLE_KEY, _SERVICE_ROLE_KEY) and an app server
 * that holds the service-role key, which `playwright.config.ts` withholds by
 * design; so it runs only when E2E_PORTAL=1 says the server was started with
 * one (E2E_SKIP_BUILD=1 against your own `next start`).
 */

const SECTIONS = ["/platform-admin", "/platform-admin/households", "/platform-admin/plans", "/platform-admin/ai", "/platform-admin/integrations", "/platform-admin/configuration", "/platform-admin/secrets", "/platform-admin/security"];

test("a signed-out visitor is sent home from every section", async ({ request }) => {
  for (const path of SECTIONS) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(new URL(response.headers().location!, "http://x").pathname, path).toBe("/");
  }
});

const url = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
/** Every E2E account uses this domain, so scripts/e2e-cleanup.mjs can find what a killed run left. */
const E2E_EMAIL_DOMAIN = "e2e.wonderhome-test.internal";
const KEY = "WHATSAPP_TEMPLATE_LANGUAGE";

test.describe("signed in as an operator", () => {
  test.skip(!url || !anonKey || !serviceKey, "needs a real Supabase project: E2E_SUPABASE_URL, _PUBLISHABLE_KEY, _SERVICE_ROLE_KEY");
  test.skip(process.env.E2E_PORTAL !== "1", "the portal reads through the service role, which the E2E app server is started without; set E2E_PORTAL=1 with a server that has it");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  let userId = "";
  let hadSaved = false;
  const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${E2E_EMAIL_DOMAIN}`;
  const password = `E2e!${Math.random().toString(36).slice(2, 12)}`;

  test.beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "E2E Staff" } });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    const profile = await admin.from("profiles").upsert({ id: userId, display_name: "E2E Staff" });
    if (profile.error) throw profile.error;
    const staff = await admin.from("platform_admins").insert({ profile_id: userId, role: "operator" });
    if (staff.error) throw staff.error;
    // Never disturb a value someone really saved: then the edit step is skipped.
    const { data } = await admin.rpc("platform_config_status");
    hadSaved = ((data ?? []) as { key: string }[]).some((row) => row.key === KEY);
  });

  test.afterAll(async () => {
    if (!hadSaved && userId) await admin.rpc("platform_config_clear", { p_key: KEY, p_actor: userId });
    if (userId) await admin.from("audit_events").delete().eq("actor_profile_id", userId).eq("event_type", "platform.config_changed");
    if (userId) await admin.from("platform_admins").delete().eq("profile_id", userId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  async function signIn(page: Page) {
    await page.goto("/sign-in?next=%2Fplatform-admin");
    await streamed(page);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/platform-admin$/);
  }

  test("the sidebar reaches each section the role may open, and not Secrets", async ({ page, isMobile }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Platform admin", level: 1 })).toBeVisible();
    for (const name of ["Households & people", "Plans & billing", "AI & providers", "Integrations", "Configuration", "Security"]) {
      if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
      const nav = page.getByRole("navigation", { name: "Platform admin sections" }).last();
      await nav.getByRole("link", { name, exact: true }).click();
      await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    }
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Platform admin sections" }).last().getByRole("link", { name: "Secrets" })).toHaveCount(0);
    expect((await page.request.get("/platform-admin/secrets")).status()).toBe(404);
  });

  test("an operator changes a setting and puts it back, with no redeploy", async ({ page }) => {
    test.skip(hadSaved, "a real saved value is there; leave it alone");
    await signIn(page);
    await page.goto("/platform-admin/integrations");
    const row = page.locator("li", { has: page.getByText(KEY, { exact: true }) });
    await row.getByRole("button", { name: "Change" }).click();
    await row.getByRole("textbox", { name: "WhatsApp template language" }).fill("en");
    await row.getByRole("button", { name: "Save", exact: true }).click();
    await expect(row.getByText(/^Saved\./)).toBeVisible();
    await expect(row.getByText("Saved here")).toBeVisible();
    await row.getByRole("button", { name: /^Use the (Vercel value|default)$/ }).click();
    await expect(row.getByText(/^Cleared\./)).toBeVisible();
  });
});
