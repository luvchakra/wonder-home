import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { streamed } from "./streaming";

/**
 * HomeTalk's talk button never does nothing (owner, 2026-11-20: "tapping on talk
 * button not working on one account"). A tap on the round waveform button either
 * opens a live conversation (the End button shows) or says, in one sentence, why
 * it can't and the one thing to do. Before the fix, a refused microphone or a
 * browser that can't listen ended the session silently on HomeTalk, because the
 * reason was drawn only in the live bar on other screens.
 *
 * The browser's recogniser is replaced before the page loads, so each case is
 * deterministic: missing, refusing the microphone, or listening. Signs in as a
 * fresh household; needs a real Supabase project, like hometalk-composer.spec.ts.
 *
 * Since 2026-11-22 (owner: "switched on by default"; #630, `voice/defaults.ts`)
 * a member who never chose follows WonderHome's default engine, Gemini Live,
 * which opens the microphone itself rather than through the recogniser. The
 * recogniser cases are WonderHome's own engine, so the member chooses it there;
 * the Gemini Live cases replace the microphone instead and keep the default.
 */

const url = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const E2E_EMAIL_DOMAIN = "e2e.wonderhome-test.internal";
const TALK = /Start a voice conversation/;

type Recogniser = "missing" | "refuses" | "listens";

/** Makes the browser's microphone refuse, as a blocked site or a device with none does. */
async function fakeMicrophone(page: Page, refusal: "NotAllowedError" | "NotFoundError") {
  await page.addInitScript((name: string) => {
    const message = name === "NotFoundError" ? "Requested device not found" : "Permission denied";
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => Promise.reject(new DOMException(message, name)),
      configurable: true,
    });
  }, refusal);
}

/** Replaces SpeechRecognition before any page script runs. */
async function fakeRecogniser(page: Page, mode: Recogniser) {
  await page.addInitScript((mode: Recogniser) => {
    const define = (value: unknown) => {
      for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
        Object.defineProperty(window, name, { value, configurable: true, writable: true });
      }
    };
    if (mode === "missing") {
      define(undefined);
      return;
    }
    class Fake {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;
      start() {
        setTimeout(() => {
          if (mode === "refuses") this.onerror?.({ error: "not-allowed" });
          else this.onstart?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    define(Fake);
  }, mode);
}

test.describe("HomeTalk's talk button always answers a tap", () => {
  test.skip(!url || !anonKey || !serviceKey, "needs a real Supabase project: E2E_SUPABASE_URL, _PUBLISHABLE_KEY, _SERVICE_ROLE_KEY");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  let userId = "";
  let householdId = "";
  let memberId = "";
  const email = `talk-${Date.now()}-${randomBytes(4).toString("hex")}@${E2E_EMAIL_DOMAIN}`;
  const password = `E2e!${randomBytes(18).toString("base64url")}`;
  let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> | null = null;

  test.beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "E2E Talk" } });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    const asUser = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const signedIn = await asUser.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    const household = await asUser
      .rpc("create_household", { p_household_name: "E2E Talk household", p_display_name: "E2E Talk", p_timezone: "Asia/Kolkata" })
      .select()
      .single();
    if (household.error) throw household.error;
    householdId = (household.data as { household_id: string }).household_id;
    // Voice is a Pro feature (conversation.voice); the talk button is offered only where the plan has it.
    const plan = await admin.from("household_subscriptions").upsert({ household_id: householdId, plan_key: "pro", status: "active" }, { onConflict: "household_id" });
    if (plan.error) throw plan.error;
    const member = await admin.from("household_members").select("id").eq("household_id", householdId).eq("profile_id", userId).single();
    if (member.error) throw member.error;
    memberId = (member.data as { id: string }).id;
  });

  /** The member's own engine choice; null follows WonderHome's default (Gemini Live). */
  async function chooseEngine(engine: "wonderhome" | null) {
    const saved = await admin.from("household_members").update({ live_engine: engine }).eq("id", memberId);
    if (saved.error) throw saved.error;
  }

  test.afterAll(async () => {
    test.setTimeout(90_000);
    if (householdId) await admin.from("households").delete().eq("id", householdId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  async function openHomeTalk(page: Page) {
    await page.setViewportSize({ width: 360, height: 740 });
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

  test("a browser that can't listen says so", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "a phone");
    await chooseEngine("wonderhome");
    await fakeRecogniser(page, "missing");
    await openHomeTalk(page);
    await page.getByRole("button", { name: TALK }).click();
    await expect(page.getByRole("alert").filter({ hasText: "This browser can't listen." })).toBeVisible();
  });

  test("a microphone refused for this site says how to allow it", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "a phone");
    await chooseEngine("wonderhome");
    await fakeRecogniser(page, "refuses");
    await openHomeTalk(page);
    await page.getByRole("button", { name: TALK }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The microphone is blocked for this site." })).toBeVisible();
    // The button is back, ready for the next tap once the microphone is allowed.
    await expect(page.getByRole("button", { name: TALK })).toBeVisible();
  });

  test("a microphone that works opens the conversation", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "a phone");
    await chooseEngine("wonderhome");
    await fakeRecogniser(page, "listens");
    await openHomeTalk(page);
    await page.getByRole("button", { name: TALK }).click();
    await expect(page.getByRole("button", { name: "End voice conversation" })).toBeVisible();
    // None of the "couldn't start" sentences (Next's route announcer is an alert too, so filter by words).
    await expect(page.getByRole("alert").filter({ hasText: /microphone is blocked|can't listen|Voice can't be used|Voice couldn't start/ })).toHaveCount(0);
  });

  test("with Gemini Live, the default, a microphone refused for this site says how to allow it", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "a phone");
    await chooseEngine(null);
    await fakeMicrophone(page, "NotAllowedError");
    await openHomeTalk(page);
    await page.getByRole("button", { name: /Start a voice conversation with Gemini Live/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The microphone is blocked for this site." })).toBeVisible();
    await expect(page.getByRole("button", { name: TALK })).toBeVisible();
  });

  test("with Gemini Live, the default, a phone with no microphone says so in words, not the browser's", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "a phone");
    await chooseEngine(null);
    await fakeMicrophone(page, "NotFoundError");
    await openHomeTalk(page);
    await page.getByRole("button", { name: /Start a voice conversation with Gemini Live/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "This browser can't listen." })).toBeVisible();
    await expect(page.getByText("Requested device not found")).toHaveCount(0);
  });
});
