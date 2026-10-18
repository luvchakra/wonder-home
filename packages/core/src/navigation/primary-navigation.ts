/**
 * WonderHome primary navigation.
 *
 * design/UI-MOCKUP-IMPLEMENTATION-SPEC.md fixes five primary information areas.
 * Mobile renders them as a bottom tab bar, desktop as a left sidebar, but the
 * set and order are the same on both. Do not invent a different nav model.
 */
export type PrimaryNavKey = "home" | "calendar" | "ai" | "family" | "more";

export type PrimaryNavItem = {
  key: PrimaryNavKey;
  label: string;
  href: string;
  /** Lucide icon name, resolved by the rendering component. */
  icon: "house" | "calendar-check" | "mic" | "users" | "grid";
  /** Short description of what the area answers, used for a11y and empty states. */
  purpose: string;
  /** Other paths that belong to this area, so the tab stays lit on them. */
  also?: readonly string[];
};

export const PRIMARY_NAVIGATION: readonly PrimaryNavItem[] = [
  {
    key: "home",
    label: "Home",
    href: "/",
    icon: "house",
    purpose: "What needs attention and what WonderHome handled",
  },
  {
    // D1 (design/FAMILY-CALENDAR-PHASE0.md): the Today tab became Calendar.
    // Today's plan is still one tap away from the Calendar's day view.
    key: "calendar",
    label: "Calendar",
    href: "/calendar",
    icon: "calendar-check",
    purpose: "The family calendar, and your plan for today",
    also: ["/today"],
  },
  {
    key: "ai",
    label: "HomeTalk",
    href: "/ai",
    icon: "mic",
    purpose: "Talk or text with WonderHome, through HomeTalk",
  },
  {
    key: "family",
    label: "Family",
    href: "/family",
    icon: "users",
    purpose: "Shared family context and member views",
  },
  {
    key: "more",
    label: "More",
    href: "/more",
    icon: "grid",
    purpose: "Household modules and settings",
  },
] as const;

/**
 * Resolves the active primary area for a pathname. The deepest matching item
 * wins so that `/more/bills` keeps "More" active rather than falling back to Home.
 */
export function activeNavKey(pathname: string): PrimaryNavKey {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/") return "home";

  let active: PrimaryNavItem | undefined;
  let depth = 0;
  for (const item of PRIMARY_NAVIGATION) {
    if (item.href === "/") continue;
    for (const href of [item.href, ...(item.also ?? [])]) {
      if ((normalized === href || normalized.startsWith(`${href}/`)) && href.length > depth) {
        active = item;
        depth = href.length;
      }
    }
  }
  return active?.key ?? "home";
}
