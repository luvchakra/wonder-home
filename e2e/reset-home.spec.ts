import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { streamed } from "./streaming";

/**
 * Reset home and Download full data (story 15-014).
 *
 * Signed out: the screen and the download are closed. Signed in, against a
 * fresh QA household made here and deleted afterwards (never a real home): the
 * owner sees the Danger zone, downloads a ZIP, types the home's name and their
 * password, resets, and lands on setup with the other member gone; the other
 * member's account is untouched and no longer belongs to the home.
 *
 * The signed-in half needs a real Supabase project with the reset migration
 * (E2E_SUPABASE_URL, _PUBLISHABLE_KEY, _SERVICE_ROLE_KEY) and skips otherwise.
 */

const url = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const E2E_EMAIL_DOMAIN = "e2e.wonderhome-test.internal";

test("signed out, the reset screen sends you to sign in", async ({ page }) => {
  await page.goto("/settings/reset-home");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Freset-home/);
});

test("signed out, the full download is refused", async ({ request }) => {
  const response = await request.post("/api/v1/households/00000000-0000-4000-8000-000000000000/export/full", { data: {} });
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test.describe("the owner downloads, then resets a QA home", () => {
  test.skip(!url || !anonKey || !serviceKey, "needs a real Supabase project: E2E_SUPABASE_URL, _PUBLISHABLE_KEY, _SERVICE_ROLE_KEY");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  const ids = { owner: "", other: "", household: "" };
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerEmail = `reset-owner-${stamp}@${E2E_EMAIL_DOMAIN}`;
  const otherEmail = `reset-other-${stamp}@${E2E_EMAIL_DOMAIN}`;
  const password = `E2e!${Math.random().toString(36).slice(2, 12)}`;
  const homeName = `E2E Reset ${stamp.slice(-6)}`;
  /** False until the owner has applied 20261121010000_household_reset.sql to this project. */
  let migrationLive = false;

  test.beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const probe = await admin.rpc("reset_household", { p_household_id: "00000000-0000-4000-8000-000000000000", p_actor_profile_id: "00000000-0000-4000-8000-000000000000", p_confirm_name: "" });
    migrationLive = probe.error?.code !== "PGRST202";
    const owner = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { display_name: "E2E Owner" } });
    if (owner.error) throw owner.error;
    ids.owner = owner.data.user.id;
    const other = await admin.auth.admin.createUser({ email: otherEmail, password, email_confirm: true, user_metadata: { display_name: "E2E Other" } });
    if (other.error) throw other.error;
    ids.other = other.data.user.id;

    const asOwner = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const signedIn = await asOwner.auth.signInWithPassword({ email: ownerEmail, password });
    if (signedIn.error) throw signedIn.error;
    const household = await asOwner.rpc("create_household", { p_household_name: homeName, p_display_name: "E2E Owner", p_timezone: "Asia/Kolkata" }).select().single();
    if (household.error) throw household.error;
    ids.household = (household.data as { household_id: string }).household_id;

    await admin.from("profiles").upsert({ id: ids.other, display_name: "E2E Other" });
    const member = await admin.from("household_members").insert({ household_id: ids.household, profile_id: ids.other, member_type: "adult", display_name: "E2E Other" }).select("id").single();
    if (member.error) throw member.error;
    await admin.from("household_roles").insert({ household_id: ids.household, member_id: member.data.id, role: "administrator" });
    const seeded = await admin.from("recipes").insert({ household_id: ids.household, name: "E2E Dal" });
    if (seeded.error) throw seeded.error;
    // The owner's own health record, so the download asks for a health records password.
    const ownerMember = await admin.from("household_members").select("id").eq("household_id", ids.household).eq("profile_id", ids.owner).single();
    if (ownerMember.error) throw ownerMember.error;
    const health = await admin.from("health_records").insert({ household_id: ids.household, member_id: ownerMember.data.id, label: "E2E thyroid report", record_type: "lab_result", file_path: `${ids.household}/e2e-report.pdf` });
    if (health.error) throw health.error;
  });

  test.afterAll(async () => {
    test.setTimeout(90_000);
    if (ids.household) await admin.from("households").delete().eq("id", ids.household);
    if (ids.owner) await admin.auth.admin.deleteUser(ids.owner);
    if (ids.other) await admin.auth.admin.deleteUser(ids.other);
  });

  /**
   * Each person signs in once per run and the session is reused: every password sign-in, step-ups
   * included, counts against Supabase's per-address limit, and a run that signed in for every test
   * could meet it.
   */
  const sessions = new Map<string, Awaited<ReturnType<BrowserContext["cookies"]>>>();

  async function signIn(page: Page, email: string, next: string) {
    const saved = sessions.get(email);
    if (saved) {
      await page.context().addCookies(saved);
      await page.goto(next);
      if (new URL(page.url()).pathname === next) return;
    }
    await page.goto(next);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
    await streamed(page);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === next && url.search === "");
    sessions.set(email, await page.context().cookies());
  }

  test("another Admin sees no Danger zone and the reset screen shows them nothing", async ({ page }) => {
    await signIn(page, otherEmail, "/settings");
    await expect(page.getByRole("heading", { name: "Danger zone" })).toHaveCount(0);
    // A streamed page answers "not found" with status 200, so check what it shows.
    await page.goto("/settings/reset-home");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: `Reset ${homeName}` }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reset home", exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download full data" }).filter({ visible: true })).toHaveCount(0);
  });

  test("another Admin downloads their own copy from Privacy & security: what they can see, not the owner's private health record", async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, otherEmail, "/settings/privacy");
    await streamed(page);
    const section = page.locator("#export");
    await section.getByLabel("Your WonderHome password", { exact: true }).fill(password);
    // The owner's health record is private to the owner, so this Admin has nothing to lock and is not asked.
    await expect(section.getByLabel("Password for the health records", { exact: true })).toHaveCount(0);
    const download = page.waitForEvent("download");
    await section.getByRole("button", { name: "Download my data" }).click();
    const file = await download;
    const zip = Buffer.concat(await (await file.createReadStream())!.toArray());
    expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(zip.includes(Buffer.from("E2E Dal"))).toBe(true);
    expect(zip.includes(Buffer.from("E2E thyroid report"))).toBe(false);
    expect(zip.includes(Buffer.from("health-records-protected.zip"))).toBe(false);
    // One activity entry, written as the download finishes: who and counts, never values.
    await expect
      .poll(async () => {
        const audit = await admin.from("audit_events").select("metadata").eq("household_id", ids.household).eq("event_type", "household.exported");
        return (audit.data ?? []).some((row) => (row.metadata as { kind?: string; completed?: boolean }).kind === "member" && (row.metadata as { completed?: boolean }).completed === true);
      })
      .toBe(true);
  });

  test("the owner sees the Danger zone last on Settings, and the reset screen's three steps", async ({ page }) => {
    await signIn(page, ownerEmail, "/settings");
    await streamed(page);
    const zone = page.locator("#danger-zone");
    await expect(zone.getByRole("heading", { name: "Danger zone" })).toBeVisible();
    await expect(zone.getByRole("button", { name: "Download full data" })).toBeVisible();
    // There is a health record to lock, so the download asks for its password, twice.
    await expect(zone.getByLabel("Password for the health records", { exact: true })).toBeVisible();
    await expect(zone.getByLabel("Type it again", { exact: true })).toBeVisible();
    await expect(zone.getByText("WonderHome doesn't keep it")).toBeVisible();
    await zone.getByRole("link", { name: /Reset home/ }).click();
    await expect(page).toHaveURL(/\/settings\/reset-home$/);
    await streamed(page);
    await expect(page.getByRole("heading", { name: `Reset ${homeName}` })).toBeVisible();
    await expect(page.getByTestId("download-note")).toContainText("haven't downloaded");
    await expect(page.getByTestId("reset-final")).toContainText("1 other members");
    await expect(page.getByText("Your plan and its billing history.", { exact: false })).toBeVisible();
    const reset = page.getByRole("button", { name: "Reset home", exact: true });
    await expect(reset).toBeDisabled();
    await page.getByLabel(`Type the home's name: ${homeName}`).fill("Some other home");
    await expect(reset).toBeDisabled();
    await page.getByLabel(`Type the home's name: ${homeName}`).fill(` ${homeName.toUpperCase()} `);
    await expect(reset).toBeEnabled();
    const width = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(width).toBeLessThanOrEqual(0);
  });

  test("the owner downloads everything, then resets the home", async ({ page }) => {
    test.skip(!migrationLive, "the reset migration is not on this project yet");
    // The download reads every table; from a machine far from the database that is a minute or more.
    test.setTimeout(300_000);
    await signIn(page, ownerEmail, "/settings/reset-home");
    await streamed(page);
    await expect(page.getByTestId("download-note")).toContainText("haven't downloaded");

    const step1 = page.locator("#download");
    await step1.getByLabel("Your WonderHome password", { exact: true }).fill(password);
    // Too short first: refused before anything is sent.
    await step1.getByLabel("Password for the health records", { exact: true }).fill("short");
    await step1.getByLabel("Type it again", { exact: true }).fill("short");
    await step1.getByRole("button", { name: "Download full data" }).click();
    await expect(step1.getByText("Use at least 12 characters")).toBeVisible();
    const healthPassword = "e2e health phrase long";
    await step1.getByLabel("Password for the health records", { exact: true }).fill(healthPassword);
    await step1.getByLabel("Type it again", { exact: true }).fill(healthPassword);
    const download = page.waitForEvent("download");
    await step1.getByRole("button", { name: "Download full data" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^wonderhome-e2e-reset-.*\.zip$/);
    const bytes = await (await file.createReadStream())!.toArray();
    const zip = Buffer.concat(bytes);
    expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(zip.includes(Buffer.from("data/meals-and-recipes/recipes.json"))).toBe(true);
    expect(zip.includes(Buffer.from("E2E Dal"))).toBe(true);
    // Health only inside the AES-256 archive; never in clear. The fields are emptied once it starts.
    expect(zip.includes(Buffer.from("health-records-protected.zip"))).toBe(true);
    expect(zip.includes(Buffer.from("E2E thyroid report"))).toBe(false);
    await expect(step1.getByLabel("Password for the health records", { exact: true })).toHaveValue("");
    await expect(page.getByTestId("download-note")).toContainText("downloaded a copy");

    const reset = page.getByRole("button", { name: "Reset home", exact: true });
    await expect(reset).toBeDisabled();
    await page.getByLabel(`Type the home's name: ${homeName}`).fill(homeName.toLowerCase());
    await page.locator("form").filter({ has: reset }).getByLabel("Your WonderHome password", { exact: true }).fill(password);
    await reset.click();
    // The reset clears every table, then the files; from far away that takes more than a few seconds.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 90_000 });

    const members = await admin.from("household_members").select("profile_id").eq("household_id", ids.household);
    expect(members.data?.map((row) => row.profile_id)).toEqual([ids.owner]);
    const recipes = await admin.from("recipes").select("id", { count: "exact", head: true }).eq("household_id", ids.household);
    expect(recipes.count).toBe(0);
    const audit = await admin.from("audit_events").select("event_type").eq("household_id", ids.household).eq("event_type", "household.reset");
    expect(audit.data).toHaveLength(1);
    const otherAccount = await admin.auth.admin.getUserById(ids.other);
    expect(otherAccount.data.user?.id).toBe(ids.other);
  });
});
