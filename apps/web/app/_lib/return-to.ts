import { sameSitePath } from "@wonderhome/core/security/same-site-path";

/**
 * "Take me there, then bring me back": a page that sends someone to fix a
 * setting passes where they were as `returnTo`, and the settings page sends
 * them back once it is saved. Only same-site paths, so it can never become
 * an open redirect.
 */
export function safeReturnTo(value: unknown): string | null {
  return sameSitePath(value, 200);
}

export function withReturnTo(href: string, returnTo: string): string {
  const [path, hash] = href.split("#");
  return `${path}${path!.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}${hash ? `#${hash}` : ""}`;
}
