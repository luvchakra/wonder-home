import { createHash } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

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
  "/calendar?view=day",
  "/calendar",
  "/ai",
  "/family",
  "/more",
  "/settings?tab=household",
  "/household/home",
  "/household/responsibilities",
  "/household/responsibilities?group=outcome",
  "/household/responsibilities?tab=mine",
  "/settings/connections",
  "/school",
  "/groceries",
  "/meals",
  "/bills",
  "/househelper",
  "/notifications",
  "/certification",
  "/settings",
  "/settings/notifications",
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
    // Deleting the household cascades through every table the tests filled; on a busy live database
    // that outran the default 30 s (nightly 42444329691).
    test.setTimeout(90_000);
    if (admin) await admin.from("ai_key_alerts").delete().eq("key_fingerprint", fakeFingerprint);
    if (householdId) await admin.from("households").delete().eq("id", householdId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  /**
   * The session from the first sign-in, reused by later tests. Each sign-in counts against
   * `auth.attempt` (30 per address per 10 minutes); since the nightly's app server has the
   * service-role key (#539) that limit is enforced, and 13 tests × 2 projects plus retries
   * passed it. A reused session that no longer works falls back to the form.
   */
  let savedCookies: Awaited<ReturnType<BrowserContext["cookies"]>> | null = null;

  async function signIn(page: Page) {
    if (savedCookies) {
      await page.context().addCookies(savedCookies);
      await page.goto("/household/responsibilities");
      if (/\/household\/responsibilities$/.test(page.url())) return;
    }
    await page.goto("/household/responsibilities");
    await expect(page).toHaveURL(/\/sign-in\?next=/);
    await streamed(page);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/household\/responsibilities$/);
    savedCookies = await page.context().cookies();
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
    }, { timeout: 30_000 }).toEqual(["execute", "execute"]);
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
    // Until an Admin picks one bar, each kind's bar follows the household's own accuracy (HomeBrain knows, 14-069).
    await expect(picker).toHaveValue("0");
    await expect(picker.locator("option")).toHaveText(["Set for each kind by WonderHome (recommended)", "More than 60%", "More than 70%", "More than 80%", "More than 85%", "More than 90%", "More than 95%", "More than 97%", "More than 99%"]);
    await expect(page.getByText("Right now, for each kind")).toBeVisible();
    await expect(page.getByText(/^Groceries: more than \d+%$/)).toBeVisible();
    await picker.selectOption("85");
    await expect.poll(async () => {
      const { data } = await admin.from("policies").select("rule").eq("household_id", householdId).eq("category", "ai_autonomy").eq("active", true).eq("name", "Add from HomeSend only when more sure than").maybeSingle();
      return (data?.rule as { percent?: number } | undefined)?.percent ?? null;
    }).toBe(85);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "How sure HomeSend must be to add on its own" })).toHaveValue("85");
    // The Admin's bar applies to every kind: the per-kind rows give way to one line saying so.
    await expect(page.getByText(/Your bar of more than 85% applies to every kind/)).toBeVisible();
    await expect(page.getByText(/^Groceries: more than \d+%$/)).toHaveCount(0);
    // Back to "Set for each kind by WonderHome": stored as no single bar.
    await page.getByRole("combobox", { name: "How sure HomeSend must be to add on its own" }).selectOption("0");
    await expect.poll(async () => {
      const { data } = await admin.from("policies").select("rule").eq("household_id", householdId).eq("category", "ai_autonomy").eq("active", true).eq("name", "Add from HomeSend only when more sure than").maybeSingle();
      return (data?.rule as { auto?: boolean } | undefined)?.auto ?? null;
    }).toBe(true);
    // Nothing overflows the phone width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
  // Record first (the owner, 2026-11-14): three choices replace the money and health switches, each saved on its own and reversible.
  test("Settings → AI Assistant: an Admin picks what Wait for Approval holds, how money and health are recorded, and email from new senders", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/settings/ai");
    await expect(page.getByText(ERROR_SCREEN)).toHaveCount(0);
    const scope = page.getByRole("combobox", { name: "What “Wait for Approval” holds" });
    const money = page.getByRole("combobox", { name: "Money and health entries" });
    const senders = page.getByRole("combobox", { name: "Email from new senders" });
    // Recording first is the default; each option is short enough not to be cut off on a phone.
    await expect(scope).toHaveValue("actions");
    await expect(money).toHaveValue("checking");
    await expect(senders).toHaveValue("ask_once");
    await expect(money.locator("option")).toHaveText(["Checking (recommended)", "Confirmed above the bar", "Wait for review"]);
    await expect(page.getByText(/A health document goes to that person’s health record, private to them/)).toBeVisible();
    const stored = (name: string) =>
      expect.poll(async () => {
        const { data } = await admin.from("policies").select("rule").eq("household_id", householdId).eq("category", "ai_autonomy").eq("active", true).eq("name", name).maybeSingle();
        return (data?.rule as { value?: string } | undefined)?.value ?? null;
      });
    await money.selectOption("review");
    await stored("Money and health entries from HomeSend").toBe("review");
    // The others are untouched until each is picked itself.
    await stored("What Wait for Approval holds").toBe(null);
    await scope.selectOption("everything");
    await stored("What Wait for Approval holds").toBe("everything");
    await senders.selectOption("review");
    await stored("Email from new senders").toBe("review");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Money and health entries" })).toHaveValue("review");
    await expect(page.getByRole("combobox", { name: "What “Wait for Approval” holds" })).toHaveValue("everything");
    await expect(page.getByRole("combobox", { name: "Email from new senders" })).toHaveValue("review");
    // And back: each switched back on its own.
    await page.getByRole("combobox", { name: "Money and health entries" }).selectOption("checking");
    await stored("Money and health entries from HomeSend").toBe("checking");
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
  // The owner, 2026-10-26: a finished turn's action preview sits behind an "i" beside its time; a decision stays inline.
  test("HomeTalk: a finished reply's preview opens from its i; one waiting for a decision stays inline", async ({ page }) => {
    const member = await admin.from("household_members").select("id").eq("household_id", householdId).eq("profile_id", userId).single();
    if (member.error) throw member.error;
    const session = await admin.from("conversation_sessions").insert({ household_id: householdId, member_id: member.data.id, channel: "text", surface: "app", status: "open" }).select("id").single();
    if (session.error) throw session.error;
    const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString();
    const messages = await admin.from("conversation_messages").insert([
      { household_id: householdId, session_id: session.data.id, role: "assistant", content: "Added Milk (2 L) to the shopping list.", metadata: { proposal: "executed", mode: "answer" }, created_at: at(30) },
      { household_id: householdId, session_id: session.data.id, role: "assistant", content: "Here is what I would do — pay the electricity bill. Shall I go ahead?", metadata: { proposal: "needs_approval", mode: "answer" }, created_at: at(20) },
    ]).select("id, content");
    if (messages.error) throw messages.error;
    const done = messages.data.find((row) => row.content.startsWith("Added"))!;
    const waiting = messages.data.find((row) => row.content.startsWith("Here"))!;
    const actions = await admin.from("conversation_actions").insert([
      { household_id: householdId, session_id: session.data.id, message_id: done.id, action_type: "add_to_list", approval_status: "executed", payload: { preview: { summary: "Add milk to the groceries", changes: ["Add 2 L milk to the shopping list"], because: "You asked for it.", reversible: true } } },
      { household_id: householdId, session_id: session.data.id, message_id: waiting.id, action_type: "make_payment", approval_status: "proposed", payload: { preview: { summary: "Pay the electricity bill", changes: ["Pay the electricity bill"], because: "It is due on Friday.", reversible: false } } },
    ]);
    if (actions.error) throw actions.error;

    await signIn(page);
    await page.goto("/ai");
    await streamed(page);
    // The decision stays inline, with its buttons; the finished turn shows no card.
    const inline = page.getByRole("region", { name: "Action preview" });
    await expect(inline).toHaveCount(1);
    await expect(inline.getByRole("button", { name: "Confirm" })).toBeVisible();
    await expect(inline.getByText("Pay the electricity bill").first()).toBeVisible();
    await expect(page.getByText("Add 2 L milk to the shopping list")).toHaveCount(0);
    const info = page.getByRole("button", { name: "Details of what WonderHome did" });
    await expect(info).toHaveCount(1);
    const box = (await info.evaluate((element) => {
      const before = getComputedStyle(element, "::before");
      return { width: element.getBoundingClientRect().width - parseFloat(before.left) - parseFloat(before.right), height: element.getBoundingClientRect().height - parseFloat(before.top) - parseFloat(before.bottom) };
    }));
    // 44 px, give or take the sub-pixel layout a scaled screen rounds to.
    expect(box.width).toBeGreaterThanOrEqual(43.5);
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    // The "i" sits left of the time, on the same line.
    const time = page.locator(`#message-${done.id} time`);
    const [infoBox, timeBox] = [(await info.boundingBox())!, (await time.boundingBox())!];
    expect(infoBox.x + infoBox.width).toBeLessThanOrEqual(timeBox.x);
    expect(Math.abs(infoBox.y + infoBox.height / 2 - (timeBox.y + timeBox.height / 2))).toBeLessThan(8);
    // Opened from the keyboard, it shows the preview; Escape closes it and focus returns to the "i".
    await info.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Add 2 L milk to the shopping list")).toBeVisible();
    await expect(page.getByText("Can be undone.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Add 2 L milk to the shopping list")).toHaveCount(0);
    await expect(info).toBeFocused();
    // A tap opens it too.
    await info.click();
    await expect(page.getByText("Add 2 L milk to the shopping list")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test("Settings → Household: the playbook is grouped into folded cards that open with their chevron", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings?tab=household");
    // Manage Household is a folded card of its own: open it before looking inside.
    await page.locator("details#manage").evaluate((card) => ((card as HTMLDetailsElement).open = true));
    const playbook = page.locator("section#playbook");
    // The add form folds its own "More detail" under the same section; the area cards are the ones whose summary carries a count.
    const groups = playbook.locator("details").filter({ has: page.locator("summary", { hasText: /·\s*\d+/ }) });
    // One card per area, alphabetical by its label, each closed with its count.
    await expect(groups.locator("summary")).toHaveText([/Laundry\s*· 1/, /Meals\s*· 1/, /Pets\s*· 1/]);
    const meals = groups.nth(1);
    await expect(meals.getByText("Cooking meals")).toBeHidden();
    await meals.locator("summary").click();
    await expect(meals.getByText("Cooking meals")).toBeVisible();
    await expect(groups.nth(2).getByText("Pet care")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
  test("Settings → Household: the links are grouped under four headings, with no second door to setup", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings?tab=household");
    const headings = page.locator("section[id^='manage-'] h2, section[id^='manage-'] h3");
    await expect(headings).toHaveText(["Your household", "How the home runs", "Notifications", "Connections and records"]);
    await expect(page.locator("#manage-running a")).toHaveText([/Responsibilities/, /Household playbook/, /Policies/, /AI autonomy/, /Teach WonderHome/]);
    // The setup card opens the walk-through; the list doesn't repeat it.
    await expect(page.locator("section[id^='manage-'] a[href='/onboarding']")).toHaveCount(0);
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
  // "Nothing waits" (the owner, 2026-11-14): the HomeSend page is the send box, "Added recently" with Undo and
  // "Set aside" with Restore; nothing waits for review there. Replaces the review-section tests (14-064, 14-066):
  // waiting items are now one question each in "Needs you" (next test), and the review sections are gone.
  test("HomeSend is the send box, Added recently and Set aside, and Restore puts an item back", async ({ page }) => {
    test.setTimeout(90_000);
    const member = await admin.from("household_members").select("id").eq("household_id", householdId).eq("profile_id", userId).single();
    if (member.error) throw member.error;
    await admin.from("homesend_changes").delete().eq("household_id", householdId);
    await admin.from("home_send_items").delete().eq("household_id", householdId);
    const base = { household_id: householdId, created_by_member_id: member.data.id, source: "pasted_text", content_type: "text/plain" };
    const seeded = await admin.from("home_send_items").insert([
      { ...base, raw_text: "2 litres milk", status: "routed", classified_kind: "grocery_item", extracted: { title: "Milk" } },
      { ...base, raw_text: "Annual Day rehearsal", status: "archived", archived_from: "classified", archived_at: new Date().toISOString(), archive_reason: "superseded", classified_kind: "school_item", extracted: { title: "Annual Day rehearsal" } },
      { ...base, raw_text: "Water bill", status: "classified", classified_kind: "bill", extracted: { title: "Water bill" } },
    ]).select("id, raw_text");
    if (seeded.error) throw seeded.error;
    const rehearsal = seeded.data.find((row) => row.raw_text === "Annual Day rehearsal")!;

    await signIn(page);
    await page.goto("/home-send");
    await expect(page.getByRole("button", { name: /Send something/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Added recently/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Set aside/ })).toBeVisible();
    // No review section: the waiting bill is not listed here, and nothing offers to add it from this page.
    await expect(page.getByRole("heading", { name: /Needs a word from you/ })).toHaveCount(0);
    await expect(page.getByText("Water bill")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add all anyway" })).toHaveCount(0);

    const row = page.locator("li").filter({ hasText: "Annual Day rehearsal" }).first();
    await expect(row).toContainText("Replaced by a newer one");
    await row.getByRole("button", { name: "Restore Annual Day rehearsal" }).click();
    await expect(page.getByText(/Restored/)).toBeVisible({ timeout: 15_000 });
    const restored = await admin.from("home_send_items").select("status").eq("id", rehearsal.id).single();
    expect(restored.data?.status).toBe("classified");
  });

  // "Needs you" (2026-11-14, decision 4): a waiting item is one question at the top of HomeTalk, with tap answers
  // and what happens if nobody answers; one tap settles it in the member's own name.
  test("Needs you: a waiting item's question shows its default and is settled with one tap", async ({ page }) => {
    test.setTimeout(90_000);
    const member = await admin.from("household_members").select("id").eq("household_id", householdId).eq("profile_id", userId).single();
    if (member.error) throw member.error;
    await admin.from("needs_you_items").delete().eq("household_id", householdId);
    const item = await admin.from("home_send_items").insert({ household_id: householdId, created_by_member_id: member.data.id, source: "pasted_text", content_type: "text/plain", raw_text: "Rehearsal next week", status: "classified", classified_kind: "school_item", extracted: { title: "Class 3 rehearsal" } }).select("id").single();
    if (item.error) throw item.error;
    const asked = new Date();
    const question = await admin.from("needs_you_items").insert({
      household_id: householdId, source: "homesend_waiting", subject_table: "home_send_items", subject_id: item.data.id, recipient_member_id: member.data.id,
      prompt: { code: "homesend.waiting", title: "Class 3 rehearsal", kind: "school_item" }, answers: [{ value: "note" }, { value: "set_aside" }],
      default_answer: "note", default_at: new Date(asked.getTime() + 86_400_000).toISOString(), expires_at: new Date(asked.getTime() + 2 * 86_400_000).toISOString(),
      consequence: 1, status: "open", created_at: asked.toISOString(),
    }).select("id").single();
    if (question.error) throw question.error;

    await signIn(page);
    await page.goto("/ai");
    const card = page.locator("#needs-you");
    await expect(card.getByRole("heading", { name: /Needs you/ })).toBeVisible();
    await expect(card).toContainText("What should I do with “Class 3 rehearsal”?");
    await expect(card).toContainText(/If nobody answers by .+, I'll keep it as a household note/);
    await card.getByRole("button", { name: "Set aside" }).click();
    await expect(card.getByRole("status")).toContainText("Done. Thanks!", { timeout: 15_000 });
    const settled = await admin.from("home_send_items").select("status, archive_reason").eq("id", item.data.id).single();
    expect(settled.data).toEqual({ status: "archived", archive_reason: "removed_by_person" });
    const closed = await admin.from("needs_you_items").select("status, answer, answered_by_member_id").eq("id", question.data.id).single();
    expect(closed.data).toEqual({ status: "answered", answer: "set_aside", answered_by_member_id: member.data.id });
  });
});
