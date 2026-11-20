import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { streamed } from "./streaming";

/**
 * HomeTalk's composer stays at the bottom of the screen on desktop (owner, 2026-11-20:
 * "in desktop view, in HomeTalk, the composer section should stick at the bottom").
 *
 * The conversation is the only thing that scrolls: the page itself never does, so the
 * composer's bottom edge sits at the viewport's bottom before and after scrolling a
 * long conversation, at a short window too. On a phone the composer keeps its place
 * above the tab bar. Signs in as a fresh household with 30 messages in its open
 * session. Needs a real Supabase project, like screens.spec.ts; skipped without one.
 */

const url = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const E2E_EMAIL_DOMAIN = "e2e.wonderhome-test.internal";

type Box = { top: number; bottom: number; left: number; right: number };

async function composerBox(page: Page): Promise<Box> {
  return page.locator("[data-hometalk-composer]").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  });
}

/** How far the page itself can scroll: zero when only the conversation scrolls. */
async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
}

test.describe("HomeTalk's composer stays put", () => {
  test.skip(!url || !anonKey || !serviceKey, "needs a real Supabase project: E2E_SUPABASE_URL, _PUBLISHABLE_KEY, _SERVICE_ROLE_KEY");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  let userId = "";
  let householdId = "";
  const email = `composer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${E2E_EMAIL_DOMAIN}`;
  const password = `E2e!${Math.random().toString(36).slice(2, 12)}`;
  let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> | null = null;

  test.beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "E2E Composer" } });
    if (created.error) throw created.error;
    userId = created.data.user.id;

    const asUser = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const signedIn = await asUser.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    const household = await asUser
      .rpc("create_household", { p_household_name: "E2E Composer household", p_display_name: "E2E Composer", p_timezone: "Asia/Kolkata" })
      .select()
      .single();
    if (household.error) throw household.error;
    householdId = (household.data as { household_id: string }).household_id;

    const member = await admin.from("household_members").select("id").eq("household_id", householdId).eq("profile_id", userId).single();
    if (member.error) throw member.error;
    const session = await admin
      .from("conversation_sessions")
      .insert({ household_id: householdId, member_id: member.data.id, channel: "text", surface: "app" })
      .select("id")
      .single();
    if (session.error) throw session.error;
    // Enough to overflow any desktop window, oldest first.
    const start = Date.now() - 30 * 60_000;
    const rows = Array.from({ length: 30 }, (_, index) => ({
      household_id: householdId,
      session_id: session.data.id,
      role: index % 2 === 0 ? "member" : "assistant",
      content: index % 2 === 0 ? `Question number ${index + 1}: what is on this week?` : `Here is answer ${index + 1}.\nA second line.\nA third line.`,
      created_at: new Date(start + index * 60_000).toISOString(),
    }));
    const inserted = await admin.from("conversation_messages").insert(rows);
    if (inserted.error) throw inserted.error;
  });

  test.afterAll(async () => {
    test.setTimeout(90_000);
    if (householdId) await admin.from("households").delete().eq("id", householdId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  async function openHomeTalk(page: Page) {
    if (cookies) await page.context().addCookies(cookies);
    await page.goto("/ai");
    if (/\/sign-in/.test(page.url())) {
      await streamed(page);
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/ai$/);
      cookies = await page.context().cookies();
    }
    await streamed(page);
    await expect(page.locator("[data-hometalk-composer] textarea")).toBeVisible();
  }

  for (const size of [
    { width: 1280, height: 600 },
    { width: 1280, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    test(`on desktop ${size.width}×${size.height} the composer stays at the bottom while the conversation scrolls`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "a desktop window");
      await page.setViewportSize(size);
      await openHomeTalk(page);

      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
      const before = await composerBox(page);
      // Its bottom edge is the window's, give or take the main column's own gap.
      expect(size.height - before.bottom).toBeGreaterThanOrEqual(0);
      expect(size.height - before.bottom).toBeLessThanOrEqual(64);
      // It follows the content column, beside the sidebar, not the viewport.
      expect(before.left).toBeGreaterThan(200);

      // Scroll the conversation back, then the page itself: the composer does not move.
      const conversation = page.locator("[aria-live=polite]").filter({ hasText: "Question number 1:" });
      await conversation.hover();
      await page.mouse.wheel(0, -4000);
      await expect.poll(() => conversation.evaluate((element) => Math.abs(element.scrollTop))).toBeGreaterThan(0);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const after = await composerBox(page);
      expect(after.bottom).toBeCloseTo(before.bottom, 0);
      expect(after.top).toBeCloseTo(before.top, 0);

      // Back at the newest message (a column-reverse scroller ends at 0), it is in view above the composer, not behind it.
      await conversation.evaluate((element) => element.scrollTo({ top: 0 }));
      await expect.poll(() => conversation.evaluate((element) => Math.abs(element.scrollTop))).toBeLessThan(1);
      const newest = await page.getByText("Here is answer 30.", { exact: false }).evaluate((element) => element.getBoundingClientRect().bottom);
      expect(newest).toBeLessThanOrEqual(after.top + 1);

      // A long draft grows the box upward to its limit; the bottom stays where it was.
      await page.locator("[data-hometalk-composer] textarea").fill(Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n"));
      const drafting = await composerBox(page);
      expect(drafting.bottom).toBeCloseTo(before.bottom, 0);
      expect(drafting.top).toBeGreaterThan(0);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    });
  }

  test("on desktop a list above the conversation takes room from it, never pushes the composer down", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a desktop window");
    await page.setViewportSize({ width: 1280, height: 600 });
    await openHomeTalk(page);
    const before = await composerBox(page);
    // Stands in for the "Needs you" list or a key alert: 240 px more above the conversation.
    await page.evaluate(() => {
      const block = document.createElement("div");
      block.style.height = "240px";
      block.style.flexShrink = "0";
      document.getElementById("wh-main")!.prepend(block);
    });
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    const after = await composerBox(page);
    expect(after.bottom).toBeCloseTo(before.bottom, 0);
  });

  test("on a phone the composer keeps its place above the tab bar", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "a phone");
    await page.setViewportSize({ width: 360, height: 740 });
    await openHomeTalk(page);
    const composer = await composerBox(page);
    const tabbar = await page.getByRole("navigation").last().evaluate((element) => element.getBoundingClientRect().top);
    expect(composer.bottom).toBeLessThanOrEqual(tabbar + 40);
    expect(composer.bottom).toBeGreaterThan(740 - 200);
  });
});
