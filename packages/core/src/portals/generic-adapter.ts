import type { LoginHints, LoginResult, PortalAdapter, PortalCredentials, PortalPage } from "./adapter";

/**
 * The default adapter: sign into an ordinary login form with no per-site code
 * (story 08-033). It finds the password field, the nearest username field and a
 * submit control by common patterns, and reads "signed in / wrong password /
 * verification asked" back from the page. A household can override any of these
 * guesses with `LoginHints` when a portal is unusual (an SPA, an odd form), and
 * a known portal registers its own adapter instead.
 *
 * It is deliberately conservative: when it cannot tell success from failure it
 * reports `transient` (safe to retry) rather than guessing `authenticated`,
 * because a false "logged in" would scrape and file a logged-out page.
 */

const USERNAME_CANDIDATES = [
  'input[type="email"]',
  'input[name*="user" i]',
  'input[name*="email" i]',
  'input[name*="login" i]',
  'input[id*="user" i]',
  'input[id*="email" i]',
  'input[type="text"]',
];
const PASSWORD_SELECTOR = 'input[type="password"]';
const SUBMIT_CANDIDATES = ['button[type="submit"]', 'input[type="submit"]', 'button'];

const LOGIN_PATH = /\b(login|signin|sign-in|logon|auth)\b/i;
const INVALID_TEXT = /\b(invalid|incorrect|wrong)\b[^.]{0,40}\b(password|credential|username|login|email)\b|\bauthentication failed\b/i;
const VERIFY_TEXT = /\b(one[- ]?time|otp|verification code|verify your|captcha|are you (a )?human)\b/i;

async function firstPresent(page: PortalPage, selectors: readonly string[]): Promise<string | null> {
  for (const selector of selectors) {
    if (await page.has(selector)) return selector;
  }
  return null;
}

export const GenericAdapter: PortalAdapter = {
  id: "generic",

  matches() {
    return true;
  },

  async isAuthenticated(page: PortalPage): Promise<boolean> {
    // Still showing a password field, or sitting on a login path → not in yet.
    if (await page.has(PASSWORD_SELECTOR)) return false;
    if (LOGIN_PATH.test(page.currentUrl())) return false;
    return true;
  },

  async login(page: PortalPage, credentials: PortalCredentials, hints?: LoginHints): Promise<LoginResult> {
    const passwordSelector = hints?.passwordSelector ?? PASSWORD_SELECTOR;
    if (!(await page.has(passwordSelector))) return { status: "transient" }; // no form found yet
    const usernameSelector = hints?.usernameSelector ?? (await firstPresent(page, USERNAME_CANDIDATES));
    if (!usernameSelector) return { status: "transient" };
    const submitSelector = hints?.submitSelector ?? (await firstPresent(page, SUBMIT_CANDIDATES));
    if (!submitSelector) return { status: "transient" };

    await page.fill(usernameSelector, credentials.username);
    await page.fill(passwordSelector, credentials.password);
    await page.click(submitSelector);

    return classifyOutcome(page, hints);
  },
};

/** Read the post-submit page and decide the outcome, preferring hinted selectors. */
async function classifyOutcome(page: PortalPage, hints?: LoginHints): Promise<LoginResult> {
  if (hints?.signedInSelector) {
    if (await page.has(hints.signedInSelector)) return { status: "authenticated" };
  } else if (await GenericAdapter.isAuthenticated(page)) {
    return { status: "authenticated" };
  }

  if (hints?.loginErrorSelector && (await page.has(hints.loginErrorSelector))) {
    return { status: "invalid_credentials" };
  }

  const text = await page.textContent();
  if (VERIFY_TEXT.test(text)) return { status: "verification_required" };
  if (INVALID_TEXT.test(text)) return { status: "invalid_credentials" };
  // Couldn't confirm success or a known failure — retryable, never a false success.
  return { status: "transient" };
}
