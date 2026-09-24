import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { PRIMARY_NAVIGATION, type PrimaryNavKey } from "../../navigation/primary-navigation";
import type { SecondaryNavItem } from "../../navigation/secondary-navigation";
import { MobileHeader, type ShellViewer } from "./mobile-header";
import { NavDrawerProvider } from "./nav-drawer";
import { PrimaryNav } from "./primary-nav";
import { SwipeMain } from "./swipe-main";

export type AppShellProps = {
  active: PrimaryNavKey;
  children: ReactNode;
  /** Who is looking. Absent on a signed-out screen, which then has no header chrome. */
  viewer?: ShellViewer;
  /** Domain links for the sidebar, filtered for this viewer. */
  secondary?: readonly SecondaryNavItem[];
  /** The current path, so the sidebar can mark a domain link current. */
  pathname?: string;
  /** Header for a subpage: a back chevron and a title. */
  back?: { href: string; label: string };
  title?: string;
  /**
   * A screen's own search, in the header in place of the title: the mark
   * beside it on a phone, and in place of the global search on desktop. The
   * title still names the page, for a screen reader.
   */
  headerSearch?: ReactNode;
  /** Optional context rail; desktop only, per the UI spec's desktop behaviour. */
  contextPanel?: ReactNode;
  /** Lets a screen use the wide desktop column (calendar, meals grid). */
  wide?: boolean;
  /**
   * A screen that fills the viewport down to the tab bar and scrolls inside
   * itself (HomeTalk): it stops just clear of the raised button rather than
   * the full clearance a scrolling page keeps, so no empty band is left.
   */
  fill?: boolean;
  className?: string;
};

/**
 * The one WonderHome layout: a sticky header, mobile-first single column with
 * a bottom tab bar, widening to sidebar + content (+ optional context panel) on
 * desktop. Five primary areas at every size; the domains live in the sidebar
 * and behind More, never in the phone's tab bar.
 */
export function AppShell({
  active,
  children,
  viewer,
  secondary,
  pathname,
  back,
  title,
  headerSearch,
  contextPanel,
  wide = false,
  fill = false,
  className,
}: AppShellProps) {
  const activeItem = PRIMARY_NAVIGATION.find((item) => item.key === active);

  return (
    <div className={cn("min-h-dvh text-[var(--wh-foreground)]", className)}>
      <a
        href="#wh-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--wh-radius-sm)] focus:bg-[var(--wh-surface)] focus:px-4 focus:py-2 focus:shadow-[var(--wh-shadow-card)]"
      >
        Skip to main content
      </a>

      <NavDrawerProvider viewer={viewer} secondary={secondary} pathname={pathname}>
        <div className="lg:flex">
          <PrimaryNav active={active} variant="sidebar" secondary={secondary} pathname={pathname} />

          <div className="min-w-0 flex-1">
            <MobileHeader viewer={viewer} back={back} title={title} search={headerSearch} />

            <div className="lg:flex lg:justify-center">
              <SwipeMain
                active={active}
                ariaLabel={activeItem?.purpose}
                className={cn(
                  "mx-auto w-full px-4 pt-4 lg:px-8 lg:pt-6 lg:pb-12",
                  fill
                    ? "pb-[calc(var(--wh-tabbar-height)+var(--wh-tabbar-raised-overhang))]"
                    : "pb-[calc(var(--wh-tabbar-height)+var(--wh-tabbar-raised-clearance))]",
                  wide ? "max-w-[var(--wh-content-wide)]" : "max-w-[var(--wh-content-max)]",
                )}
              >
                {children}
              </SwipeMain>

              {contextPanel ? (
                <aside
                  aria-label="Household context"
                  className="hidden w-80 shrink-0 border-l border-[var(--wh-border)] px-6 py-6 xl:block"
                >
                  {contextPanel}
                </aside>
              ) : null}
            </div>
          </div>
        </div>

        <PrimaryNav active={active} variant="tabbar" />
      </NavDrawerProvider>
    </div>
  );
}
