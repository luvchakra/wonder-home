import { createServerClient } from "@supabase/ssr";
import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test";

import { streamed } from "./streaming";

/**
 * Signing in for E2E specs.
 *
 * The 2026-11-24 nightly failed whole runs on "the Sign in click didn't leave
 * /sign-in": the click had submitted (the button read "Signing in…"), but the
 * sign-in action makes four calls to Supabase one after another and then
 * renders the next page, and on the live project, when its shared instance
 * stalls under the nightly's load, that took longer than the 5 s a
 * `toHaveURL` waits. Most specs sign in only to get somewhere, so they use
 * `signInAs`: one call to Supabase Auth, the same cookies the app sets,
 * reused for the account across the worker. The specs whose subject is the
 * form itself use `signInThroughForm`, which waits for the action's answer
 * the way a person watching "Signing in…" does (docs/progress/2026-11-25-nightly-sign-in.md).
 */

const sessions = new Map<string, Cookie[]>();

/** The cookies `@supabase/ssr` writes for this account, made with one password sign-in and kept for the worker. */
async function sessionCookies(email: string, password: string, origin: string): Promise<Cookie[]> {
  const saved = sessions.get(email);
  if (saved) return saved;
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("signInAs needs E2E_SUPABASE_URL and E2E_SUPABASE_PUBLISHABLE_KEY");

  const jar = new Map<string, { value: string; options: { path?: string; sameSite?: unknown; maxAge?: number } }>();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, { value }]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) jar.set(name, { value, options });
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`E2E sign-in for ${email} was refused: ${error.code ?? error.message}`);

  const { hostname } = new URL(origin);
  const cookies: Cookie[] = [...jar]
    .filter(([, { value }]) => value)
    .map(([name, { value }]) => ({
      name,
      value,
      domain: hostname,
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    }));
  sessions.set(email, cookies);
  return cookies;
}

/** Signs this browser context in as the account, as if it had just used the form. */
export async function signInAs(context: BrowserContext, email: string, password: string, origin: string): Promise<void> {
  await context.addCookies(await sessionCookies(email, password, origin));
}

/** Signs in, then opens `path` and checks it is really there (not bounced to sign-in). */
export async function openSignedIn(page: Page, email: string, password: string, path: string): Promise<void> {
  const base = test.info().project.use.baseURL;
  if (!base) throw new Error("openSignedIn needs a baseURL in playwright.config.ts");
  const want = new URL(path, base);
  await signInAs(page.context(), email, password, want.origin);
  await page.goto(path);
  await expect(page).toHaveURL((url) => url.pathname === want.pathname);
}

/**
 * Signs in through the form on the current sign-in page, as a person does:
 * fill, click, and wait for the sign-in action to answer. A refusal fails
 * with the message the form shows; otherwise it waits for the page the
 * action sends the person to.
 */
export async function signInThroughForm(page: Page, email: string, password: string): Promise<void> {
  await streamed(page);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  const answered = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/sign-in" && Boolean(response.request().headers()["next-action"]) && response.request().postData()?.includes(email) === true,
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await answered;
  // The answer either moves the person on or puts a message in the form.
  const refusal = page.locator("form [role=alert]");
  const moved = page.waitForURL((url) => url.pathname !== "/sign-in").then(() => "moved" as const);
  const refused = refusal.first().waitFor({ state: "visible" }).then(() => "refused" as const);
  // Whichever loses is still pending; keep its eventual rejection from surfacing as unhandled.
  moved.catch(() => undefined);
  refused.catch(() => undefined);
  const outcome = await Promise.race([moved, refused]);
  if (outcome === "refused") throw new Error(`Sign-in was refused: ${(await refusal.first().textContent())?.trim()}`);
}
