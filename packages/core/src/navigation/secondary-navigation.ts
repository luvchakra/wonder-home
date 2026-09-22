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
  | "certification"
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
    | "badge-check"
    | "bell"
    | "settings-2"
    | "user-round-cog";
  tone: "primary" | "school" | "money" | "meals" | "care" | "home" | "people" | "ai" | "neutral";
  /** One line of purpose, shown as the card subtitle. */
  purpose: string;
  /** Any one of these unlocks the item; null means everyone. */
  requires: readonly Permission[] | null;
  /** Hidden from a child's view even when no permission is involved. */
  adultOnly?: boolean;
};

export const SECONDARY_NAVIGATION: readonly SecondaryNavItem[] = [
  { key: "responsibilities", label: "Responsibilities", href: "/household/responsibilities", icon: "list-checks", tone: "primary", purpose: "Clear roles, less chaos", requires: null, adultOnly: true },
  { key: "school", label: "Kids & School", href: "/school", icon: "graduation-cap", tone: "school", purpose: "All school info in one place", requires: ["school.view_own", "school.manage"] },
  { key: "groceries", label: "Groceries", href: "/groceries", icon: "shopping-basket", tone: "care", purpose: "Never run out again", requires: null, adultOnly: true },
  { key: "meals", label: "Meals & Recipes", href: "/meals", icon: "utensils", tone: "meals", purpose: "Healthy meals, happier moods", requires: null },
  { key: "bills", label: "Bills & Finance", href: "/bills", icon: "wallet", tone: "money", purpose: "Stay on top", requires: ["finance.view"] },
  { key: "househelper", label: "Househelper", href: "/househelper", icon: "hand-heart", tone: "people", purpose: "Support that works", requires: null, adultOnly: true },
  { key: "upkeep", label: "Home & Upkeep", href: "/household/home", icon: "wrench", tone: "home", purpose: "Maintenance, laundry and pets", requires: null, adultOnly: true },
  { key: "certification", label: "HomeBrain review", href: "/certification", icon: "badge-check", tone: "ai", purpose: "Your home, understood", requires: null, adultOnly: true },
  { key: "notifications", label: "Notifications", href: "/notifications", icon: "bell", tone: "neutral", purpose: "Sparse and actionable", requires: null },
  { key: "manage", label: "Manage Household", href: "/household", icon: "settings-2", tone: "neutral", purpose: "Playbook, policies, AI autonomy", requires: ["household.manage"] },
  { key: "settings", label: "Settings & Profile", href: "/settings", icon: "user-round-cog", tone: "neutral", purpose: "You, your preferences, your privacy", requires: null },
] as const;

export type Viewer = { permissions: readonly Permission[]; tone: "adult" | "child" | "helper" };

/** The items this viewer may be offered. Presentation only — see above. */
export function secondaryNavigationFor(viewer: Viewer): SecondaryNavItem[] {
  return SECONDARY_NAVIGATION.filter((item) => {
    if (item.adultOnly && viewer.tone === "child") return false;
    if (item.requires && !item.requires.some((permission) => viewer.permissions.includes(permission))) return false;
    return true;
  });
}
