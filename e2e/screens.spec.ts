import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { streamed } from "./streaming";

/**
 * Every signed-in screen loads against real data (the 2026-10-26 outage).
 *
 * Types, unit tests and a placeholder project cannot see a mismatch between
 * the code and what a real database holds: on 2026-10-26 the two-mode
 * autonomy code went live while rows were still stored as "observe", and
 * the Responsibilities page showed "Something went wrong" until the live
 * migration ran. This signs in as a fresh household with responsibilities
 * in both modes (and one nobody owns), opens each main screen, and fails on
 * the error screen or a server error. It also saves a group's autonomy
 * through the real action and reads it back from the database.
 *
 * Needs a real Supabase project (E2E_SUPABASE_URL, _PUBLISHABLE_KEY,
 * _SERVICE_ROLE_KEY), like the signed-in part of help.spec.ts; without one
 * it is skipped and says so. Runs nightly (e2e-nightly.yml).
 */

const url = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
/** Every E2E account uses this domain, so scripts/e2e-cleanup.mjs can find what a killed run left. */
const E2E_EMAIL_DOMAIN = "e2e.wonderhome-test.internal";

/** The main signed-in screens, as shell.spec.ts gates them. */
const SCREENS = [
  "/today",
  "/calendar",
  "/ai",
  "/family",
  "/more",
  "/household",
  "/household/home",
  "/household/members",
  "/household/responsibilities",
  "/household/responsibilities?group=outcome",
  "/household/responsibilities?tab=mine",
  "/household/setup",
  "/household/activity",
  "/household/integrations",
  "/school",
  "/groceries",
  "/meals",
  "/bills",
  "/househelper",
  "/notifications",
  "/certification",
  "/settings",
  "/settings/privacy",
  "/settings/ai",
  "/settings/plan",
];

const ERROR_SCREEN = "Something went wrong";

test.describe("every signed-in screen loads", () => {
  test.skip(!url || !anonKey || !serviceKey, "needs a real Supabase project: E2E_SUPABASE_URL, _PUBLISHABLE_KEY, _SERVICE_ROLE_KEY");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  let userId = "";
  let householdId = "";
  const email = `screens-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${E2E_EMAIL_DOMAIN}`;
  const password = `E2e!${Math.random().toString(36).slice(2, 12)}`;

  test.beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "E2E Screens" } });
    if (created.error) throw created.error;
    userId = created.data.user.id;

    const asUser = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const signedIn = await asUser.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    const household = await asUser
      .rpc("create_household", { p_household_name: "E2E Screens household", p_display_name: "E2E Screens", p_timezone: "Asia/Kolkata" })
      .select()
      .single();
    if (household.error) throw household.error;
    householdId = (household.data as { household_id: string }).household_id;

    const member = await admin.from("household_members").select("id").eq("household_id", householdId).eq("profile_id", userId).single();
    if (member.error) throw member.error;
    // Both modes, and one nobody owns, so every screen meets every shape a group can take.
    const seeded = await admin.from("responsibilities").insert([
      { household_id: householdId, outcome_key: "laundry.ready", primary_member_id: member.data.id, ai_mode: "prepare" },
      { household_id: householdId, outcome_key: "laundry.folded", primary_member_id: member.data.id, ai_mode: "prepare" },
      { household_id: householdId, outcome_key: "meals.dinner_ready", primary_member_id: member.data.id, ai_mode: "execute" },
      { household_id: householdId, outcome_key: "pets.cared_for", primary_member_id: null, ai_mode: "prepare" },
    ]);
    if (seeded.error) throw seeded.error;
  });

  test.afterAll(async () => {
    if (householdId) await admin.from("households").delete().eq("id", householdId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  async function signIn(page: Page) {
    await page.goto("/household/responsibilities");
    await expect(page).toHaveURL(/\/sign-in\?next=/);
    await streamed(page);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/household\/responsibilities$/);
  }

  test("no main screen shows the error screen or a server error", async ({ page }) => {
    // One visit per screen, each a full server render against the project.
    test.setTimeout(SCREENS.length * 10_000);
    await signIn(page);
    const broken: string[] = [];
    for (const path of SCREENS) {
      const response = await page.goto(path);
      // An error boundary can stream in after the load event.
      await streamed(page);
      const status = response?.status() ?? 0;
      const errorShown = await page.getByText(ERROR_SCREEN).count();
      if (status >= 500 || errorShown > 0) broken.push(`${path} (status ${status}${errorShown ? ", error screen" : ""})`);
    }
    expect(broken, `screens that broke: ${broken.join("; ")}`).toEqual([]);
  });

  test("Responsibilities: a group's dropdown offers the two choices and saves one for the whole group", async ({ page }) => {
    await signIn(page);
    await page.goto("/household/responsibilities?group=outcome");
    await streamed(page);
    await expect(page.getByText(ERROR_SCREEN)).toHaveCount(0);

    // The laundry group: both owned, both "Wait for Approval".
    const laundry = page.locator("form").filter({ hasText: /laundry/i }).first();
    await laundry.getByRole("button", { name: "How much WonderHome does on its own: Wait for Approval" }).click();
    const choices = laundry.locator('button[name="aiMode"]');
    await expect(choices).toHaveCount(2);
    await expect(choices.nth(0)).toContainText("Wait for Approval");
    await expect(choices.nth(1)).toContainText("Pre Approved");

    await choices.nth(1).click();
    await expect.poll(async () => {
      const { data } = await admin.from("responsibilities").select("outcome_key, ai_mode").eq("household_id", householdId).like("outcome_key", "laundry.%");
      return (data ?? []).map((row) => row.ai_mode).sort();
    }).toEqual(["execute", "execute"]);
    // The other groups are untouched.
    const { data: others } = await admin.from("responsibilities").select("outcome_key, ai_mode").eq("household_id", householdId).not("outcome_key", "like", "laundry.%");
    expect(Object.fromEntries((others ?? []).map((row) => [row.outcome_key, row.ai_mode]))).toEqual({ "meals.dinner_ready": "execute", "pets.cared_for": "prepare" });
  });

  test("Responsibilities: a group with an outcome nobody owns cannot be set to Pre Approved", async ({ page }) => {
    await signIn(page);
    await page.goto("/household/responsibilities?group=outcome");
    await streamed(page);
    const pets = page.locator("form").filter({ hasText: /pets/i }).first();
    await pets.getByRole("button", { name: /How much WonderHome does on its own:/ }).click();
    await expect(pets.locator('button[name="aiMode"][value="execute"]')).toBeDisabled();
    await expect(pets.getByText("Give every responsibility here an owner first.")).toBeVisible();
  });
});
