import type { Permission } from "../identity/permissions";

/**
 * The household domains, as the desktop sidebar and the More screen list them.
 *
 * These are never in the phone's bottom bar (design/UI-UX-REQUIREMENTS-v3.md §4:
 * "do not put every household domain in bottom navigation"). Each carries the
 * permission that unlocks it, and a screen filters the list through the
 * member's personal view before rendering — which is presentation; the pages
 * and the API check again.
 */
export type SecondaryNavKey =
  | "responsibilities"
  | "school"
  | "groceries"
  | "meals"
  | "bills"
  | "househelper"
  | "upkeep"
  | "health"
  | "certification"
  | "homesend"
  | "notifications"
  | "manage"
  | "settings";

export type SecondaryNavItem = {
  key: SecondaryNavKey;
  label: string;
  href: string;
  /** Lucide icon name, resolved by the rendering component. */
  icon:
    | "list-checks"
    | "graduation-cap"
    | "shopping-basket"
    | "utensils"
    | "wallet"
    | "hand-heart"
    | "wrench"
    | "heart-pulse"
    | "badge-check"
    | "send"
    | "bell"
    | "settings-2"
    | "user-round-cog";
  tone: "primary" | "school" | "money" | "meals" | "care" | "home" | "people" | "ai" | "health" | "neutral";
  /** One line of purpose, shown as the card subtitle. */
  purpose: string;
  /** Any one of these unlocks the item; null means everyone. */
  requires: readonly Permission[] | null;
  /** Hidden from a child's view even when no permission is involved. */
  adultOnly?: boolean;
  /** Which labelled section this item falls under in the nav drawer and the More page. */
  group: SecondaryNavGroup;
};

/** The nav drawer / More page's section groupings, in display order. */
export const SECONDARY_GROUP_ORDER = ["family", "food", "home", "ai", "manage"] as const;
export type SecondaryNavGroup = (typeof SECONDARY_GROUP_ORDER)[number];

export const SECONDARY_GROUP_LABELS: Record<SecondaryNavGroup, string> = {
  family: "Family & People",
  food: "Food & Essentials",
  home: "Home & Lifestyle",
  ai: "AI & Smart Tools",
  manage: "Manage",
};

export const SECONDARY_NAVIGATION: readonly SecondaryNavItem[] = [
  { key: "responsibilities", label: "Responsibilities", href: "/household/responsibilities", icon: "list-checks", tone: "primary", purpose: "Clear roles, less chaos", requires: null, adultOnly: true, group: "family" },
  { key: "school", label: "Kids & School", href: "/school", icon: "graduation-cap", tone: "school", purpose: "All school info in one place", requires: ["school.view_own", "school.manage"], group: "family" },
  { key: "househelper", label: "Househelper", href: "/househelper", icon: "hand-heart", tone: "people", purpose: "Support that works", requires: null, adultOnly: true, group: "family" },
  { key: "groceries", label: "Groceries", href: "/groceries", icon: "shopping-basket", tone: "care", purpose: "Always be stocked", requires: null, adultOnly: true, group: "food" },
  { key: "meals", label: "Meals & Recipes", href: "/meals", icon: "utensils", tone: "meals", purpose: "Plan, cook, enjoy", requires: null, group: "food" },
  { key: "bills", label: "Bills & Finance", href: "/bills", icon: "wallet", tone: "money", purpose: "Stay on top", requires: ["finance.view"], group: "food" },
  { key: "upkeep", label: "Home & Upkeep", href: "/household/home", icon: "wrench", tone: "home", purpose: "A well-kept home", requires: null, adultOnly: true, group: "home" },
  { key: "health", label: "Health & Fitness", href: "/health", icon: "heart-pulse", tone: "health", purpose: "Stay on top, without keeping track of it all", requires: null, adultOnly: true, group: "home" },
  { key: "certification", label: "HomeBrain Review", href: "/certification", icon: "badge-check", tone: "ai", purpose: "Your home, understood", requires: null, adultOnly: true, group: "ai" },
  { key: "homesend", label: "HomeSend", href: "/home-send", icon: "send", tone: "ai", purpose: "Send WonderHome anything", requires: null, adultOnly: true, group: "ai" },
  { key: "notifications", label: "Notifications", href: "/notifications", icon: "bell", tone: "neutral", purpose: "Sparse and actionable", requires: null, group: "manage" },
  { key: "manage", label: "Manage Household", href: "/household", icon: "settings-2", tone: "neutral", purpose: "Playbook, policies, AI autonomy", requires: ["household.manage"], group: "manage" },
  { key: "settings", label: "Settings & Profile", href: "/settings", icon: "user-round-cog", tone: "neutral", purpose: "You, your preferences, your privacy", requires: null, group: "manage" },
] as const;

/**
 * Buckets an already-filtered, already-permission-checked item list into its
 * labelled sections, in `SECONDARY_GROUP_ORDER`, dropping any section that
 * has nothing in it for this viewer — the nav drawer and the More page both
 * read this rather than each grouping the flat list their own way, so the
 * two can never drift apart on which item lives in which section.
 */
export function groupSecondaryNavigation(
  items: readonly SecondaryNavItem[],
  /** The section names in the viewer's language (story 22-004); English where absent. */
  labels: Partial<Record<SecondaryNavGroup, string>> = {},
): { group: SecondaryNavGroup; label: string; items: SecondaryNavItem[] }[] {
  return SECONDARY_GROUP_ORDER.map((group) => ({
    group,
    label: labels[group] ?? SECONDARY_GROUP_LABELS[group],
    items: items.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);
}

export type Viewer = { permissions: readonly Permission[]; tone: "adult" | "child" | "helper" };

/** The items this viewer may be offered. Presentation only — see above. */
export function secondaryNavigationFor(viewer: Viewer): SecondaryNavItem[] {
  return SECONDARY_NAVIGATION.filter((item) => {
    if (item.adultOnly && viewer.tone === "child") return false;
    if (item.requires && !item.requires.some((permission) => viewer.permissions.includes(permission))) return false;
    return true;
  });
}
