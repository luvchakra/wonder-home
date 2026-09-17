import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { PRIMARY_NAVIGATION, type PrimaryNavKey } from "../../navigation/primary-navigation";
import { PrimaryNav } from "./primary-nav";

export type AppShellProps = {
  active: PrimaryNavKey;
  children: ReactNode;
  /** Optional context rail; desktop only, per the UI spec's desktop behavior. */
  contextPanel?: ReactNode;
  className?: string;
};

/**
 * The one WonderHome layout: mobile-first single column with a bottom tab bar,
 * widening to sidebar + content (+ optional context panel) on desktop.
 */
export function AppShell({ active, children, contextPanel, className }: AppShellProps) {
  const activeItem = PRIMARY_NAVIGATION.find((item) => item.key === active);

  return (
    <div className={cn("min-h-dvh bg-[var(--wh-background)] text-[var(--wh-foreground)]", className)}>
      <a
        href="#wh-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--wh-radius-sm)] focus:bg-[var(--wh-surface)] focus:px-4 focus:py-2 focus:shadow-[var(--wh-shadow-card)]"
      >
        Skip to main content
      </a>

      <div className="lg:flex">
        <PrimaryNav active={active} variant="sidebar" />

        <div className="flex-1 lg:flex lg:justify-center">
          <main
            id="wh-main"
            aria-label={activeItem?.purpose}
            className="mx-auto w-full max-w-[var(--wh-content-max)] px-4 pt-4 pb-[calc(var(--wh-tabbar-height)+1.5rem)] lg:max-w-[var(--wh-content-max)] lg:px-8 lg:pt-8 lg:pb-12"
          >
            {children}
          </main>

          {contextPanel ? (
            <aside
              aria-label="Household context"
              className="hidden w-80 shrink-0 border-l border-[var(--wh-border)] px-6 py-8 xl:block"
            >
              {contextPanel}
            </aside>
          ) : null}
        </div>
      </div>

      <PrimaryNav active={active} variant="tabbar" />
    </div>
  );
}
