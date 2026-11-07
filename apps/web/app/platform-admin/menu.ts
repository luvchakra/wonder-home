import { currentNavHref } from "@wonderhome/core/navigation/current-nav";

/** Where "Back to WonderHome" goes, on every platform-admin page. */
export const BACK_TO_APP_HREF = "/";

export type PlatformMenuIcon =
  | "overview"
  | "households"
  | "plans"
  | "performance"
  | "ai"
  | "integrations"
  | "configuration"
  | "secrets"
  | "careers"
  | "landing"
  | "security";
export type PlatformMenuTone = "primary" | "ai" | "people" | "money" | "home" | "health" | "neutral" | "risk";

/** The sidebar's headings, as WonderWorks' admin groups its rail (owner, 2026-11-07). */
export type PlatformMenuGroup = "Run" | "Configure" | "Guard";

export type PlatformMenuEntry = {
  href: string;
  label: string;
  icon: PlatformMenuIcon;
  tone: PlatformMenuTone;
  /** The heading it sits under; none for Overview, which stands first on its own. */
  group?: PlatformMenuGroup;
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
  { href: "/platform-admin/households", label: "Households & people", icon: "households", tone: "people", group: "Run" },
  { href: "/platform-admin/plans", label: "Plans & billing", icon: "plans", tone: "money", group: "Run", capability: "subscription.manage" },
  { href: "/platform-admin/performance", label: "Performance", icon: "performance", tone: "ai", group: "Run" },
  { href: "/platform-admin/ai", label: "AI & providers", icon: "ai", tone: "ai", group: "Configure" },
  { href: "/platform-admin/integrations", label: "Integrations", icon: "integrations", tone: "home", group: "Configure" },
  { href: "/platform-admin/configuration", label: "Configuration", icon: "configuration", tone: "neutral", group: "Configure" },
  { href: "/platform-admin/secrets", label: "Secrets", icon: "secrets", tone: "risk", group: "Configure", capability: "secrets.manage" },
  { href: "/platform-admin/landing", label: "Landing page", icon: "landing", tone: "primary", group: "Configure", capability: "settings.manage" },
  { href: "/platform-admin/careers", label: "Careers connection", icon: "careers", tone: "people", group: "Configure", capability: "careers.manage" },
  { href: "/platform-admin/security", label: "Security", icon: "security", tone: "health", group: "Guard", capability: "audit.read_platform" },
];

export type PlatformMenuItem = Omit<PlatformMenuEntry, "capability">;

/** The items this staff member may see; `can` is the server-side capability check (kept out of here so the client shell never imports it). */
export function platformMenuFor(can: (capability: string) => boolean): PlatformMenuItem[] {
  return PLATFORM_MENU.filter((entry) => !entry.capability || can(entry.capability)).map((entry) => ({
    href: entry.href,
    label: entry.label,
    icon: entry.icon,
    tone: entry.tone,
    ...(entry.group ? { group: entry.group } : {}),
  }));
}

/** The items under each heading, in menu order; the ungrouped ones first. */
export function groupedMenu<T extends { group?: PlatformMenuGroup }>(items: readonly T[]): { group: PlatformMenuGroup | null; items: T[] }[] {
  const out: { group: PlatformMenuGroup | null; items: T[] }[] = [];
  for (const item of items) {
    const group = item.group ?? null;
    let bucket = out.find((entry) => entry.group === group);
    if (!bucket) {
      bucket = { group, items: [] };
      out.push(bucket);
    }
    bucket.items.push(item);
  }
  return out;
}

/** The href of the current item for `pathname` (the longest match, so /platform-admin/careers/x lights Careers). */
export function currentPlatformHref(pathname: string | null | undefined, items: readonly { href: string }[]): string | undefined {
  return currentNavHref(pathname, items);
}
