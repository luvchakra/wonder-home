/**
 * "Take me there, then bring me back": a page that sends someone to fix a
 * setting passes where they were as `returnTo`, and the settings page sends
 * them back once it is saved. Only same-site paths, so it can never become
 * an open redirect.
 */
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.length > 200) return null;
  return path;
}

export function withReturnTo(href: string, returnTo: string): string {
  const [path, hash] = href.split("#");
  return `${path}${path!.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}${hash ? `#${hash}` : ""}`;
}
