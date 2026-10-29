/**
 * Where the header's back arrow goes. A first-level screen (reached from the
 * menu, More or a link) always goes Home; a nested screen goes to its parent.
 * Always a plain href, never browser history, so it behaves the same whether
 * the person arrived by menu, deep link or a notification.
 */
const HOME = "/";
/** "More" is a menu, not a parent: screens that used to point back to it go Home. */
const MORE = "/more";

function stripQuery(href: string): string {
  return href.split("?")[0] ?? href;
}

/** The parent of a path by segment ("/chat/abc" → "/chat", "/chat" → "/"). */
export function parentPath(pathname: string): string {
  const segments = stripQuery(pathname).split("/").filter(Boolean);
  segments.pop();
  return segments.length ? `/${segments.join("/")}` : HOME;
}

/**
 * @param pathname the current screen's path
 * @param explicit a parent the screen names itself (kept when it is a real parent)
 */
export function backTarget({ pathname, explicit }: { pathname?: string; explicit?: string }): string {
  if (explicit && stripQuery(explicit) === MORE) return HOME;
  if (explicit && explicit.startsWith("/") && !explicit.startsWith("//")) return explicit;
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) return HOME;
  return parentPath(pathname);
}
