/**
 * WonderHome primary navigation.
 *
 * design/UI-MOCKUP-IMPLEMENTATION-SPEC.md fixes five primary information areas.
 * Mobile renders them as a bottom tab bar, desktop as a left sidebar, but the
 * set and order are the same on both. Do not invent a different nav model.
 */
export type PrimaryNavKey = "home" | "today" | "ai" | "family" | "more";

export type PrimaryNavItem = {
  key: PrimaryNavKey;
  label: string;
  href: string;
  /** Lucide icon name, resolved by the rendering component. */
  icon: "house" | "calendar-check" | "mic" | "users" | "ellipsis";
  /** Short description of what the area answers, used for a11y and empty states. */
  purpose: string;
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
    key: "today",
    label: "Today",
    href: "/today",
    icon: "calendar-check",
    purpose: "Your actionable plan for today",
  },
  {
    key: "ai",
    label: "Talk",
    href: "/ai",
    icon: "mic",
    purpose: "Talk or text with WonderHome",
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
    icon: "ellipsis",
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
  for (const item of PRIMARY_NAVIGATION) {
    if (item.href === "/") continue;
    if (normalized === item.href || normalized.startsWith(`${item.href}/`)) {
      if (!active || item.href.length > active.href.length) active = item;
    }
  }
  return active?.key ?? "home";
}
