import type { Page } from "@playwright/test";

/**
 * Waits until React has put every streamed Suspense boundary in place.
 *
 * A page that streams (anything under the root `loading.tsx`) arrives with
 * its content in a hidden `<div hidden id="S:n">` buffer, which an inline
 * script then reveals into its final place. For a moment each element exists
 * twice: the hidden copy and the placed one. Nobody sees the hidden copy, but
 * a strict locator counts it and fails with "resolved to 2 elements". The
 * page's `load` event does not wait for the reveal, so a test that locates
 * something straight after `goto` races it.
 */
export async function streamed(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector('div[hidden][id^="S:"]') === null);
}

/** `page.goto`, then wait for the streamed content to be in place. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await streamed(page);
}
