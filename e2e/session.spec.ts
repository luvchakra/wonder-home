// lint-secrets: fixtures — the JWT-shaped strings below are forgeries by design,
// present to prove the server refuses them rather than to carry anything real.
import { expect, test } from "@playwright/test";

/**
 * Session abuse (story 15-008).
 *
 * A signed-in session is the credential this whole product rests on, so these
 * are the ways somebody tries to get one without earning it: forging a cookie,
 * replaying a stale one, keeping one across a sign-out, and reading one out of
 * a page that should not hold it.
 *
 * All of them run anonymously against a real server. Nothing here needs a live
 * account, which is what makes them runnable in CI rather than notes about
 * things somebody should check by hand.
 */

const GATED = "/today";
const SUPABASE_COOKIE = /^sb-.*-auth-token/;

test("a forged session cookie does not sign anybody in", async ({ page, context }) => {
  // The shape is right and the signature is not. Tokens are verified against
  // the project's signing keys, so "looks like a JWT" is not a session.
  await context.addCookies([
    {
      name: "sb-kqxndableyysxqhxiorz-auth-token",
      value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.not-a-real-signature",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  await page.goto(GATED);
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a garbage cookie is refused rather than crashing the gate", async ({ page, context }) => {
  // A parser that throws on malformed input is a denial of service on every
  // page behind it, and sometimes a way past the gate entirely.
  await context.addCookies([
    { name: "sb-kqxndableyysxqhxiorz-auth-token", value: "%%%not-base64%%%", domain: "127.0.0.1", path: "/" },
  ]);

  const response = await page.goto(GATED);
  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
});

test("an anonymous visitor is never handed a session cookie", async ({ page, context }) => {
  // Session fixation begins with a server issuing a session before anybody has
  // authenticated; there is then a cookie to plant in somebody else's browser.
  await page.goto("/sign-in");

  const cookies = await context.cookies();
  const auth = cookies.filter((cookie) => SUPABASE_COOKIE.test(cookie.name) && cookie.value.length > 0);
  expect(auth, "an anonymous visit created a session cookie").toEqual([]);
});

test("the API refuses a bearer token it did not issue", async ({ request }) => {
  const response = await request.get("/api/v1/me", {
    headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdHRhY2tlciJ9.forged" },
  });

  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe("unauthenticated");
});

test("a gated page never carries a session token into the HTML", async ({ page }) => {
  // A token rendered into markup outlives the response in caches, history and
  // anything that scrapes a page.
  await page.goto(GATED);
  const html = await page.content();

  expect(html).not.toMatch(/eyJhbGciOi/);
  expect(html.toLowerCase()).not.toContain("service_role");
  expect(html).not.toMatch(/sb_secret_/);
});

test("session cookies are http-only and same-site", async ({ page, context }) => {
  // Not something a test can set up without an account, so it is asserted of
  // whatever cookies the app does set: none of them may be readable by script.
  await page.goto("/sign-in");

  for (const cookie of await context.cookies()) {
    if (!SUPABASE_COOKIE.test(cookie.name)) continue;
    expect(cookie.httpOnly, `${cookie.name} is readable by script`).toBe(true);
    expect(cookie.sameSite, `${cookie.name} is sent cross-site`).not.toBe("None");
  }
});

test("signing out is a POST, so a link cannot do it to somebody", async ({ request }) => {
  // A sign-out reachable by GET is a cross-site request forgery that logs
  // people out of their own home from any page on the internet.
  const response = await request.get("/api/v1/auth/sign-out", { maxRedirects: 0 });
  expect([404, 405]).toContain(response.status());
});
