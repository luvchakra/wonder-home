import { CalendarCheck, Ellipsis, House, Sparkles, Users } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "../../lib/cn";
import {
  PRIMARY_NAVIGATION,
  type PrimaryNavItem,
  type PrimaryNavKey,
} from "../../navigation/primary-navigation";

const ICONS: Record<PrimaryNavItem["icon"], ComponentType<{ className?: string }>> = {
  house: House,
  "calendar-check": CalendarCheck,
  sparkles: Sparkles,
  users: Users,
  ellipsis: Ellipsis,
};

export type PrimaryNavProps = {
  active: PrimaryNavKey;
  variant: "tabbar" | "sidebar";
};

export function PrimaryNav({ active, variant }: PrimaryNavProps) {
  if (variant === "sidebar") {
    return (
      <nav
        aria-label="Primary"
        className="sticky top-0 hidden h-dvh w-[var(--wh-sidebar-width)] shrink-0 flex-col gap-1 border-r border-[var(--wh-border)] px-4 py-6 lg:flex"
      >
        <div className="mb-6 px-3">
          <p className="text-lg font-semibold tracking-tight">WonderHome</p>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">
            Happier homes. Brighter tomorrows.
          </p>
        </div>
        {PRIMARY_NAVIGATION.map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = item.key === active;
          return (
            <a
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-[var(--wh-radius-sm)] px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]"
                  : "text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--wh-border)] bg-[var(--wh-surface)]/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-[var(--wh-content-max)] items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {PRIMARY_NAVIGATION.map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = item.key === active;
          return (
            <li key={item.key} className="flex-1">
              <a
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[var(--wh-tabbar-height)] flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium transition-colors",
                  isActive ? "text-[var(--wh-primary)]" : "text-[var(--wh-foreground-subtle)]",
                )}
              >
                <Icon className="size-5" />
                <span>{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
