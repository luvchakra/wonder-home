/**
 * Which nav item is the current page. One rule for the drawer, the sidebar and
 * the tab bar: the longest matching href wins, and an item can exclude
 * sub-paths that belong to something else (Profile is reached from the avatar,
 * so Settings does not light up there).
 */
export type CurrentNavCandidate = {
  href: string;
  /** Sub-paths that are not this item's, even though the href prefixes them. */
  excludes?: readonly string[];
};

const trim = (path: string) => path.replace(/\/+$/, "") || "/";
const within = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** The href of the item that is current for `pathname` (query strings ignored), or undefined. */
export function currentNavHref(pathname: string | null | undefined, items: readonly CurrentNavCandidate[]): string | undefined {
  if (!pathname) return undefined;
  const path = trim(pathname.split(/[?#]/)[0] ?? "");
  let best: string | undefined;
  for (const item of items) {
    const href = trim(item.href);
    if (!within(path, href) && !(href === "/" && path === "/")) continue;
    if (item.excludes?.some((x) => within(path, trim(x)))) continue;
    if (href === "/" && path !== "/") continue;
    if (best === undefined || href.length > best.length) best = href;
  }
  return best;
}
