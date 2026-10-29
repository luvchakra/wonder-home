import { currentNavHref } from "@wonderhome/core/navigation/current-nav";

/** Where "Back to WonderHome" goes, on every platform-admin page. */
export const BACK_TO_APP_HREF = "/";

export type PlatformMenuIcon = "overview" | "performance" | "careers";
export type PlatformMenuTone = "primary" | "ai" | "people";

export type PlatformMenuEntry = {
  href: string;
  label: string;
  icon: PlatformMenuIcon;
  tone: PlatformMenuTone;
  /** The capability that shows this item; leave out for every staff member. */
  capability?: string;
};

/**
 * Every platform-admin section, in one place: the next staff page is one more
 * entry here (plus its icon in `menu-shell.tsx`). The menu only decides what is
 * shown; each page still checks its own capability on the server.
 */
export const PLATFORM_MENU: readonly PlatformMenuEntry[] = [
  { href: "/platform-admin", label: "Overview", icon: "overview", tone: "primary" },
  { href: "/platform-admin/performance", label: "Performance", icon: "performance", tone: "ai" },
  { href: "/platform-admin/careers", label: "Careers connection", icon: "careers", tone: "people", capability: "careers.manage" },
];

export type PlatformMenuItem = Omit<PlatformMenuEntry, "capability">;

/** The items this staff member may see; `can` is the server-side capability check (kept out of here so the client shell never imports it). */
export function platformMenuFor(can: (capability: string) => boolean): PlatformMenuItem[] {
  return PLATFORM_MENU.filter((entry) => !entry.capability || can(entry.capability)).map((entry) => ({
    href: entry.href,
    label: entry.label,
    icon: entry.icon,
    tone: entry.tone,
  }));
}

/** The href of the current item for `pathname` (the longest match, so /platform-admin/careers/x lights Careers). */
export function currentPlatformHref(pathname: string | null | undefined, items: readonly { href: string }[]): string | undefined {
  return currentNavHref(pathname, items);
}
