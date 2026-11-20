import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { englishInstallBannerLabels } from "../../pwa/install-labels";
import { PRIMARY_NAVIGATION, type PrimaryNavKey } from "../../navigation/primary-navigation";
import type { SecondaryNavItem } from "../../navigation/secondary-navigation";
import { DocumentLocale } from "./document-locale";
import { InstallBanner } from "./install-banner";
import { backTarget } from "../../navigation/back-target";
import { MobileHeader, type ShellViewer } from "./mobile-header";
import { NavDrawerProvider } from "./nav-drawer";
import { PrimaryNav } from "./primary-nav";
import { ScrollChrome } from "./scroll-chrome";
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
  /** Header for a subpage: a back chevron and a title. `href` names a nested screen's parent; a first-level screen (or "/more") goes Home (navigation/back-target.ts). */
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
   * On desktop it is a height chain: the shell is exactly the window's
   * height and the main column passes the rest down as a flex column, so
   * whatever sits above the screen's own scroller (a "Needs you" list, an
   * alert) takes room from it and the page itself never scrolls (owner,
   * 2026-11-20: HomeTalk's composer must stay at the bottom).
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
    <div data-audience={viewer?.audience} className={cn("min-h-dvh text-[var(--wh-foreground)]", fill && "lg:flex lg:h-dvh lg:flex-col", className)}>
      <a
        href="#wh-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--wh-radius-sm)] focus:bg-[var(--wh-surface)] focus:px-4 focus:py-2 focus:shadow-[var(--wh-shadow-card)]"
      >
        Skip to main content
      </a>

      {/* Above the header, in the flow: it pushes the page down, never covers it. */}
      <InstallBanner labels={viewer?.labels?.install ?? englishInstallBannerLabels()} />

      <NavDrawerProvider viewer={viewer} secondary={secondary} pathname={pathname}>
        <div className={cn("lg:flex", fill && "lg:min-h-0 lg:flex-1")}>
          <PrimaryNav active={active} variant="sidebar" secondary={secondary} pathname={pathname} labels={viewer?.labels} viewer={viewer} />

          <div className={cn("min-w-0 flex-1", fill && "lg:flex lg:min-h-0 lg:flex-col")}>
            <MobileHeader viewer={viewer} back={back ? { ...back, href: backTarget({ pathname, explicit: back.href }) } : undefined} title={title} search={headerSearch} />

            <div className={cn("lg:flex lg:justify-center", fill && "lg:min-h-0 lg:flex-1")}>
              <SwipeMain
                active={active}
                ariaLabel={activeItem?.purpose}
                className={cn(
                  "mx-auto w-full px-4 pt-4 lg:px-8 lg:pt-6",
                  fill
                    ? "pb-[calc(var(--wh-tabbar-height)+var(--wh-tabbar-raised-overhang))] lg:flex lg:min-h-0 lg:flex-col lg:pb-[calc(1.5rem+var(--wh-live-bar-clearance))]"
                    : "pb-[calc(var(--wh-tabbar-height)+var(--wh-tabbar-raised-clearance)+var(--wh-live-bar-clearance))] lg:pb-[calc(3rem+var(--wh-live-bar-clearance))]",
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

        <PrimaryNav active={active} variant="tabbar" labels={viewer?.labels} />
        <ScrollChrome />
        {viewer?.language ? <DocumentLocale language={viewer.language} dir={viewer.dir ?? "ltr"} /> : null}
      </NavDrawerProvider>
    </div>
  );
}
