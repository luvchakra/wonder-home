import {
  BadgeCheck,
  Bell,
  CalendarCheck,
  Ellipsis,
  GraduationCap,
  HandHeart,
  House,
  ListChecks,
  Settings2,
  ShoppingBasket,
  Sparkles,
  UserRoundCog,
  Users,
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

const ICONS: Record<PrimaryNavItem["icon"], ComponentType<{ className?: string }>> = {
  house: House,
  "calendar-check": CalendarCheck,
  sparkles: Sparkles,
  users: Users,
  ellipsis: Ellipsis,
};

const SECONDARY_ICONS: Record<SecondaryNavItem["icon"], ComponentType<{ className?: string }>> = {
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
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[var(--wh-tabbar-height)] flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium transition-colors",
                  isActive ? "text-[var(--wh-primary)]" : "text-[var(--wh-foreground-subtle)]",
                )}
              >
                {isAi ? (
                  <span
                    className={cn(
                      "-mt-5 grid size-12 place-items-center rounded-full text-[var(--wh-primary-foreground)] shadow-[var(--wh-shadow-primary)] ring-4 ring-[var(--wh-background)] transition-transform",
                      isActive ? "scale-105" : "",
                    )}
                    style={{ background: "var(--wh-gradient-primary)" }}
                  >
                    <Icon className="size-5" />
                  </span>
                ) : (
                  <Icon className={cn("size-5", isActive && "fill-[var(--wh-primary-soft)]")} />
                )}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-[var(--wh-radius-sm)] px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
        active
          ? "bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]"
          : "text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)]",
      )}
    >
      <Icon className="size-[1.125rem] shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
