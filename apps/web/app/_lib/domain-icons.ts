import {
  BadgeCheck,
  Bell,
  GraduationCap,
  HandHeart,
  ListChecks,
  Settings2,
  ShoppingBasket,
  UserRoundCog,
  Utensils,
  Wallet,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";

import type { SecondaryNavItem } from "@wonderhome/core/navigation/secondary-navigation";

/** The glyph for each domain, resolved once so every screen agrees. */
export const DOMAIN_ICONS: Record<SecondaryNavItem["icon"], ComponentType<{ className?: string }>> = {
  "list-checks": ListChecks,
  "graduation-cap": GraduationCap,
  "shopping-basket": ShoppingBasket,
  utensils: Utensils,
  wallet: Wallet,
  "hand-heart": HandHeart,
  wrench: Wrench,
  "badge-check": BadgeCheck,
  bell: Bell,
  "settings-2": Settings2,
  "user-round-cog": UserRoundCog,
};
