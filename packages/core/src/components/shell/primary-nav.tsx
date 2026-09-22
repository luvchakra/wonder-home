import {
  BadgeCheck,
  Bell,
  Calendar,
  Check,
  GraduationCap,
  HandHeart,
  Heart,
  HeartPulse,
  House,
  LayoutGrid,
  ListChecks,
  Mic,
  Send,
  Settings2,
  ShoppingBasket,
  User,
  UserRoundCog,
  Utensils,
  Wallet,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { cn } from "../../lib/cn";
import {
  PRIMARY_NAVIGATION,
  type PrimaryNavItem,
  type PrimaryNavKey,
} from "../../navigation/primary-navigation";
import type { SecondaryNavItem } from "../../navigation/secondary-navigation";
import { Wordmark } from "../ui/brand";
import { IconTile, type IconTone } from "../ui/icon-tile";
import { MoreTabButton } from "./nav-drawer";

/**
 * Today: a calendar in whatever colour the tab itself is (grey resting, blue
 * active — the same rule every other tab icon follows), with a checkmark
 * that stays handled-green regardless, because "the day is planned" is a
 * fact independent of which tab you're looking at.
 */
function TodayTabIcon({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-grid size-5 shrink-0 place-items-center", className)}>
      <Calendar aria-hidden className="size-5" />
      <Check aria-hidden strokeWidth={3.5} className="absolute top-[52%] left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 text-[var(--wh-handled)]" />
    </span>
  );
}

/**
 * Family: two people and the heart between them, rather than Lucide's own
 * flat two-tone `Users` glyph — the front figure follows the tab's own
 * colour, the one behind keeps the household's warm tone, and the heart is
 * the same pink already used for "family" everywhere else in the app.
 */
function FamilyTabIcon({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block size-5 shrink-0", className)}>
      <User aria-hidden fill="currentColor" strokeWidth={0} className="absolute right-0 bottom-0 size-3.5 text-[var(--wh-tone-money)]" />
      <User aria-hidden fill="currentColor" strokeWidth={0} className="absolute bottom-0 left-0 size-4" />
      <Heart aria-hidden fill="currentColor" strokeWidth={0} className="absolute -top-0.5 left-2.5 size-2.5 text-[var(--wh-tone-people)]" />
    </span>
  );
}

export const ICONS: Record<PrimaryNavItem["icon"], ComponentType<{ className?: string }>> = {
  house: House,
  "calendar-check": TodayTabIcon,
  mic: Mic,
  users: FamilyTabIcon,
  grid: LayoutGrid,
};

export const SECONDARY_ICONS: Record<SecondaryNavItem["icon"], ComponentType<{ className?: string }>> = {
  "list-checks": ListChecks,
  "graduation-cap": GraduationCap,
  "shopping-basket": ShoppingBasket,
  utensils: Utensils,
  wallet: Wallet,
  "hand-heart": HandHeart,
  wrench: Wrench,
  "heart-pulse": HeartPulse,
  "badge-check": BadgeCheck,
  send: Send,
  bell: Bell,
  "settings-2": Settings2,
  "user-round-cog": UserRoundCog,
};

export type PrimaryNavProps = {
  active: PrimaryNavKey;
  variant: "tabbar" | "sidebar";
  /** Domain links for the sidebar, already filtered for this viewer. */
  secondary?: readonly SecondaryNavItem[];
  /** The current pathname, so a domain link can mark itself current. */
  pathname?: string;
};

export function PrimaryNav({ active, variant, secondary = [], pathname }: PrimaryNavProps) {
  if (variant === "sidebar") {
    const domains = secondary.filter((item) => item.key !== "settings" && item.key !== "notifications");
    const settings = secondary.find((item) => item.key === "settings");

    return (
      <nav
        aria-label="Primary"
        className="sticky top-0 hidden h-dvh w-[var(--wh-sidebar-width)] shrink-0 flex-col border-r border-[var(--wh-border)] bg-[var(--wh-surface)]/60 px-4 py-5 lg:flex"
      >
        <Link href="/" className="mb-6 block px-2">
          <Wordmark tagline />
        </Link>

        <ul className="space-y-0.5">
          {PRIMARY_NAVIGATION.map((item) => {
            const Icon = ICONS[item.icon];
            const isActive = item.key === active && !(item.key === "more" && pathname && pathname !== "/more");
            return (
              <li key={item.key}>
                <SidebarLink href={item.href} icon={Icon} label={item.label} active={isActive} />
              </li>
            );
          })}
        </ul>

        {domains.length > 0 ? (
          <>
            <p className="mt-6 mb-1.5 px-3 text-[0.625rem] font-semibold tracking-[0.12em] text-[var(--wh-foreground-subtle)] uppercase">
              Household
            </p>
            <ul className="space-y-0.5">
              {domains.map((item) => (
                <li key={item.key}>
                  <SidebarLink
                    href={item.href}
                    icon={SECONDARY_ICONS[item.icon]}
                    label={item.label}
                    tone={item.tone}
                    active={Boolean(pathname && (pathname === item.href || pathname.startsWith(`${item.href}/`)))}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {settings ? (
          <div className="mt-auto pt-4">
            <SidebarLink
              href={settings.href}
              icon={SECONDARY_ICONS[settings.icon]}
              label="Settings"
              active={Boolean(pathname && pathname.startsWith(settings.href))}
            />
          </div>
        ) : null}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Primary"
      className="wh-glass fixed inset-x-0 bottom-0 z-40 border-t border-[var(--wh-border)]/70 lg:hidden"
    >
      <ul className="mx-auto flex max-w-[var(--wh-content-max)] items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {PRIMARY_NAVIGATION.map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = item.key === active;
          const isAi = item.key === "ai";
          const content = isAi ? (
            <>
              <span
                className={cn(
                  "-mt-5 grid size-12 place-items-center rounded-full text-[var(--wh-primary-foreground)] shadow-[var(--wh-shadow-primary)] ring-4 ring-[var(--wh-background)] transition-transform",
                  isActive ? "scale-105" : "",
                )}
                style={{ background: "var(--wh-gradient-primary)" }}
              >
                <Icon className="size-5" />
              </span>
              <span>{item.label}</span>
            </>
          ) : (
            // The other four sit in a soft pill when they're the current
            // area, rather than only the icon and text changing colour —
            // the same "active means a filled shape, not just a tint" the
            // sidebar's own current-item row already uses.
            <span
              className={cn(
                "flex flex-col items-center gap-1 rounded-[var(--wh-radius)] px-3 py-1.5 transition-colors",
                isActive && "bg-[var(--wh-primary-soft)]",
              )}
            >
              <Icon className={cn("size-5", isActive && "fill-[var(--wh-primary-soft)]")} />
              <span>{item.label}</span>
            </span>
          );
          const tabClass = cn(
            "flex min-h-[var(--wh-tabbar-height)] w-full flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium transition-colors",
            isActive ? "text-[var(--wh-primary)]" : "text-[var(--wh-foreground-subtle)]",
          );

          return (
            <li key={item.key} className="flex-1">
              {item.key === "more" ? (
                <MoreTabButton className={tabClass} isActive={isActive}>
                  {content}
                </MoreTabButton>
              ) : (
                <Link href={item.href} aria-current={isActive ? "page" : undefined} className={tabClass}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  onClick,
  size = "sm",
  tone,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  /** Fires on navigation — a drawer closes itself when a link is actually followed. */
  onClick?: () => void;
  /** "lg" gives a taller, easier-to-tap row for a touch-only drawer. */
  size?: "sm" | "lg";
  /**
   * A household domain's own colour (rule 3), shown as a tinted `IconTile`
   * instead of a bare glyph. Left out for the five primary areas above the
   * domain list, which have never carried a domain colour of their own.
   */
  tone?: IconTone;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[var(--wh-radius-sm)] border-l-[3px] px-2.5 text-[0.8125rem] font-medium transition-colors",
        size === "lg" ? "min-h-12 text-sm" : "min-h-10",
        active
          ? "border-[var(--wh-primary)] bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]"
          : "border-transparent text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)]",
      )}
    >
      {tone ? <IconTile icon={Icon} tone={tone} size="sm" /> : <Icon className="size-[1.125rem] shrink-0" />}
      <span className="truncate">{label}</span>
    </Link>
  );
}
