import { createHash } from "node:crypto";

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
    // A playbook in three areas, so Manage Household has groups to fold.
    const playbook = await admin.from("playbook_items").insert([
      { household_id: householdId, outcome_key: "laundry.ready", name: "Laundry", outcome_definition: "Clean clothes are folded and put away." },
      { household_id: householdId, outcome_key: "meals.dinner_ready", name: "Cooking meals", outcome_definition: "Dinner is on the table on time." },
      { household_id: householdId, outcome_key: "pets.cared_for", name: "Pet care", outcome_definition: "The pets are fed and well." },
    ]);
    if (playbook.error) throw playbook.error;
  });

  /** A made-up Gemini voice key for the key-alert test, and its fingerprint (the alert row outlives the household). */
  const fakeVoiceKey = `AIza-e2e-${Math.random().toString(36).slice(2, 14)}-not-a-real-key`;
  const fakeFingerprint = createHash("sha256").update(fakeVoiceKey, "utf8").digest("hex");

  test.afterAll(async () => {
    if (admin) await admin.from("ai_key_alerts").delete().eq("key_fingerprint", fakeFingerprint);
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
      // An error boundary can stream in after the load event, and a render
      // that failed leaves its hidden buffer unrevealed (/notifications did).
      const settled = await streamed(page, { timeout: 8_000 }).then(() => true, () => false);
      const status = response?.status() ?? 0;
      const errorShown = await page.getByText(ERROR_SCREEN).count();
      if (status >= 500 || errorShown > 0 || !settled) {
        broken.push(`${path} (status ${status}${errorShown ? ", error screen" : ""}${settled ? "" : ", never finished loading"})`);
      }
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
  test("Settings → AI Assistant: an Admin picks how sure HomeSend must be to add on its own", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/settings/ai");
    await expect(page.getByText(ERROR_SCREEN)).toHaveCount(0);
    const picker = page.getByRole("combobox", { name: "How sure HomeSend must be to add on its own" });
    await expect(picker).toHaveValue("95");
    await expect(picker.locator("option")).toHaveText(["More than 60%", "More than 70%", "More than 80%", "More than 85%", "More than 90%", "More than 95% (recommended)", "More than 97%", "More than 99%"]);
    await picker.selectOption("85");
    await expect.poll(async () => {
      const { data } = await admin.from("policies").select("rule").eq("household_id", householdId).eq("category", "ai_autonomy").eq("active", true).eq("name", "Add from HomeSend only when more sure than").maybeSingle();
      return (data?.rule as { percent?: number } | undefined)?.percent ?? null;
    }).toBe(85);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "How sure HomeSend must be to add on its own" })).toHaveValue("85");
    // Nothing overflows the phone width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
  // Principle 20, the owner 2026-10-26: HomeTalk's question offers its answers to pick (story 14-053).
  test("HomeTalk: the latest question's answers are chips to pick, an answered one's are greyed", async ({ page }) => {
    const member = await admin.from("household_members").select("id").eq("household_id", householdId).eq("profile_id", userId).single();
    if (member.error) throw member.error;
    const session = await admin.from("conversation_sessions").insert({ household_id: householdId, member_id: member.data.id, channel: "text", surface: "app", status: "open" }).select("id").single();
    if (session.error) throw session.error;
    const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString();
    const day = { mode: "single", choices: [{ label: "Today", say: "today" }, { label: "Tomorrow", say: "tomorrow" }, { label: "Saturday", say: "saturday" }, { label: "Another day…", say: null }] };
    const seeded = await admin.from("conversation_messages").insert([
      { household_id: householdId, session_id: session.data.id, role: "assistant", content: "When should I remind you — later today, tomorrow, or another day?", metadata: { proposal: "clarify", mode: "clarify", choices: day }, created_at: at(60) },
      { household_id: householdId, session_id: session.data.id, role: "member", content: "tomorrow", metadata: {}, created_at: at(50) },
      { household_id: householdId, session_id: session.data.id, role: "assistant", content: "First, Coconut oil: How much should I get?", metadata: { proposal: "executed", mode: "clarify", questionOnly: true, choices: { mode: "single", choices: [{ label: "500 ml", say: "500 ml" }, { label: "1 litre", say: "1 litre" }, { label: "2 litres", say: "2 litres" }, { label: "Skip", say: "skip" }] } }, created_at: at(40) },
    ]);
    if (seeded.error) throw seeded.error;

    await signIn(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/ai");
    await streamed(page);
    const groups = page.getByRole("radiogroup", { name: "Answers to pick" });
    await expect(groups).toHaveCount(2);
    // The answered question's choices stay, greyed; the open one's can be picked.
    await expect(groups.first().getByRole("radio")).toHaveText(["Today", "Tomorrow", "Saturday", "Another day…"]);
    for (const radio of await groups.first().getByRole("radio").all()) await expect(radio).toBeDisabled();
    const open = groups.last().getByRole("radio");
    await expect(open).toHaveText(["500 ml", "1 litre", "2 litres", "Skip"]);
    for (const radio of await open.all()) {
      await expect(radio).toBeEnabled();
      expect((await radio.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    // A turn that only asked shows no "Done … Can be undone" card.
    await expect(page.getByText("Can be undone")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    // The text box always stays.
    await expect(page.locator("textarea")).toBeVisible();
  });
  test("Manage Household: the playbook is grouped into folded cards that open with their chevron", async ({ page }) => {
    await signIn(page);
    await page.goto("/household");
    const playbook = page.locator("section#playbook");
    const groups = playbook.locator("details");
    // One card per area, alphabetical by its label, each closed with its count.
    await expect(groups.locator("summary")).toHaveText([/Laundry\s*· 1/, /Meals\s*· 1/, /Pets\s*· 1/]);
    const meals = groups.nth(1);
    await expect(meals.getByText("Cooking meals")).toBeHidden();
    await meals.locator("summary").click();
    await expect(meals.getByText("Cooking meals")).toBeVisible();
    await expect(groups.nth(2).getByText("Pet care")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
  test("Manage Household: the links are grouped under four headings, with no second door to setup", async ({ page }) => {
    await signIn(page);
    await page.goto("/household");
    const headings = page.locator("section[id^='manage-'] h2, section[id^='manage-'] h3");
    await expect(headings).toHaveText(["Your household", "How the home runs", "Notifications", "Connections and records"]);
    await expect(page.locator("#manage-running a")).toHaveText([/Responsibilities/, /Household playbook/, /Policies/, /AI autonomy/]);
    // The setup card opens the walk-through; the list doesn't repeat it.
    await expect(page.locator("section[id^='manage-'] a[href='/household/setup']")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
  test("an AI key out of credits is said on HomeTalk and on Settings → AI Assistant", async ({ page }) => {
    const member = await admin.from("household_members").select("id").eq("household_id", householdId).eq("profile_id", userId).single();
    if (member.error) throw member.error;
    const key = await admin.from("household_gemini_voice_credentials").upsert({ household_id: householdId, provider: "google", api_key: fakeVoiceKey, set_by_member_id: member.data.id });
    if (key.error) throw key.error;
    const alert = await admin.rpc("record_ai_key_alert", { p_fingerprint: fakeFingerprint, p_provider: "google", p_kind: "out_of_credits" });
    if (alert.error) throw alert.error;

    await signIn(page);
    await page.goto("/ai");
    const banner = page.getByRole("alert").filter({ hasText: "The Gemini voice key needs attention" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Google says this key is out of credits");
    await expect(banner.getByRole("link", { name: "Open AI settings" })).toHaveAttribute("href", "/settings/ai");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

    await page.goto("/settings/ai");
    await expect(page.getByRole("alert").filter({ hasText: "The Gemini voice key needs attention" })).toBeVisible();

    // A call with the key working again clears it everywhere.
    await admin.rpc("resolve_ai_key_alert", { p_fingerprint: fakeFingerprint });
    await page.goto("/ai");
    await expect(page.getByText("The Gemini voice key needs attention")).toHaveCount(0);
  });
  test("HomeSend shows how sure WonderHome is with each entry, on the list and in the review", async ({ page }) => {
    const member = await admin.from("household_members").select("id").eq("household_id", householdId).eq("profile_id", userId).single();
    if (member.error) throw member.error;
    const understanding = {
      kind: "grocery_item", readable: true, confidence: "high", score: 0.97, check: { verified: true, unverified: [] }, facts: [], change: "new",
      safety: { signals: [], instructionsIgnored: false }, entities: [], references: [],
      provenance: { url: null, sender: null, channel: "whatsapp", subject: null, filename: null, contentType: null, transcriptConfidence: null },
      contentSummary: "A shopping-list line asking to buy mustard oil.",
      candidateActions: [{ type: "add_grocery_item", confidence: 0.97, fields: { title: "Mustard oil", quantity: 2, unit: "l" } }],
    };
    const extracted = { title: "Mustard oil", quantity: 2, unit: "l", notes: null, payee: null, amount: null, people: [], needs: [], lines: [], dueDate: null, subject: null, summary: understanding.contentSummary, billKind: null, category: null, currency: null, secondary: null, confidence: "high", schoolKind: null, documentDate: null, healthRecordType: null, subjectMemberName: null };
    const inserted = await admin.from("home_send_items").insert({ household_id: householdId, created_by_member_id: member.data.id, source: "pasted_text", raw_text: "2 litres mustard oil", content_type: "text/plain", status: "classified", classified_kind: "grocery_item", extracted, understanding });
    if (inserted.error) throw inserted.error;

    await signIn(page);
    await page.goto("/home-send");
    const row = page.locator("li").filter({ hasText: "Mustard oil" }).first();
    await expect(row).toContainText("97% sure · every detail is in what you sent");
    await row.getByRole("button").first().click();
    await expect(page.getByText(/High · 97% sure · every detail is in what you sent/)).toBeVisible();
    await expect(page.getByText("Suggested · 97% sure").first()).toBeVisible();
    await expect(page.getByLabel(/Quantity/)).toHaveValue("2");
  });

  // The owner, 2026-10-26: HomeSend asks for what an entry still lacks, and Add waits for it.
  test("HomeSend says what a bill still needs, marks it, and keeps Add off until it is filled in", async ({ page }) => {
    const member = await admin.from("household_members").select("id").eq("household_id", householdId).eq("profile_id", userId).single();
    if (member.error) throw member.error;
    const understanding = {
      kind: "bill", readable: true, confidence: "high", score: 0.9, check: { verified: true, unverified: [] }, facts: [], change: "new",
      safety: { signals: [], instructionsIgnored: false }, entities: [], references: [],
      provenance: { url: null, sender: null, channel: "pasted_text", subject: null, filename: null, contentType: null, transcriptConfidence: null },
      contentSummary: "A water bill from BWSSB.",
      candidateActions: [{ type: "add_bill", confidence: 0.9, fields: { title: "Water bill", payee: "BWSSB" } }],
    };
    const extracted = { title: "Water bill", payee: "BWSSB", amount: null, currency: null, dueDate: null, notes: null, quantity: null, unit: null, people: [], needs: [], lines: [], subject: null, summary: understanding.contentSummary, billKind: null, category: null, secondary: null, confidence: "high", schoolKind: null, documentDate: null, healthRecordType: null, subjectMemberName: null };
    const inserted = await admin.from("home_send_items").insert({ household_id: householdId, created_by_member_id: member.data.id, source: "pasted_text", raw_text: "BWSSB water bill", content_type: "text/plain", status: "classified", classified_kind: "bill", extracted, understanding });
    if (inserted.error) throw inserted.error;

    await signIn(page);
    await page.goto("/home-send");
    await page.locator("li").filter({ hasText: "Water bill" }).first().getByRole("button").first().click();
    await expect(page.getByRole("status").filter({ hasText: "Still needed: Amount, Due" })).toBeVisible();
    await expect(page.getByLabel("Amount", { exact: true })).toHaveAttribute("aria-invalid", "true");
    const add = page.getByRole("button", { name: "Add", exact: true });
    await expect(add).toBeDisabled();
    await page.getByLabel("Amount", { exact: true }).fill("640");
    await expect(page.getByRole("status").filter({ hasText: "Still needed: Due" })).toBeVisible();
    await expect(add).toBeDisabled();
    await page.getByLabel("Due", { exact: true }).fill("2026-11-10");
    await expect(page.getByText(/Still needed/)).toHaveCount(0);
    await expect(add).toBeEnabled();
  });
});
