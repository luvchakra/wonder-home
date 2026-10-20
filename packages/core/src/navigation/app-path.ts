/**
 * A path inside WonderHome that HomeTalk may take the person to: one of the
 * app's own screens, optionally with a plain query ("/groceries?view=to-buy"),
 * never another site, a protocol-relative "//host" or anything with a script
 * in it. The one check the server, the contract and the browser all use.
 */
const APP_PATH = /^\/(?!\/)[a-z0-9/_-]*(?:\?[a-z0-9=&_-]*)?$/i;

export function appPath(href: unknown): string | null {
  return typeof href === "string" && APP_PATH.test(href) ? href : null;
}

/**
 * After HomeTalk changed something, the screen that shows it: the first link
 * to a WonderHome screen in its own reply ("Added Tomato to the [shopping
 * list](/groceries?view=to-buy)"), so the person lands where the change is
 * (the owner, 2026-10-20). A reply with no such link goes nowhere.
 */
export function screenShowing(replyText: string): string | null {
  for (const match of replyText.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = appPath(match[1]);
    if (href) return href;
  }
  return null;
}
