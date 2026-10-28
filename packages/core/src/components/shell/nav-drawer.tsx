"use client";

import { Menu } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import type { SecondaryNavItem } from "../../navigation/secondary-navigation";
import type { ShellViewer } from "./mobile-header";
import { useLoadedLater } from "./when-idle";

/**
 * The full menu, as a drawer (rules 4, 6, 10).
 *
 * The desktop sidebar already shows every primary area and every household
 * domain at once, permanently — there was never a "More" to tap on desktop,
 * because there was nothing left to collapse. A phone has no room for that,
 * so its equivalent has always been a second screen: the bottom bar's "More"
 * tab used to be a plain link to a full `/more` page. This is that same
 * "everything else" menu — every domain, Manage, Settings, Notifications,
 * Help — collapsed into an overlay instead, so it opens over whatever a
 * person was already looking at rather than replacing it, and closes the
 * moment they pick something.
 *
 * Home, Today, AI and Family are deliberately left out: they're already one
 * tap away, always visible, in the bottom tab bar the drawer opens on top
 * of — repeating them here would just be the same five destinations twice.
 *
 * Radix owns focus, escape and scroll locking, same as every other sheet in
 * this kit (rule 6). Closed by default: nothing here calls `setOpen(true)`
 * on mount, so the state a viewer lands in — on the very first paint, before
 * any tap — is always collapsed.
 */

const loadPanel = () => import("./nav-drawer-panel");

type NavDrawerContextValue = { open: boolean; setOpen: (open: boolean) => void };

const NavDrawerContext = createContext<NavDrawerContextValue | null>(null);

function useNavDrawer(): NavDrawerContextValue {
  const context = useContext(NavDrawerContext);
  if (!context) throw new Error("useNavDrawer must be used within NavDrawerProvider");
  return context;
}

export function NavDrawerProvider({
  viewer,
  secondary = [],
  pathname,
  children,
}: {
  viewer?: ShellViewer;
  /** Every menu and submenu item this viewer may see, already filtered server-side. */
  secondary?: readonly SecondaryNavItem[];
  pathname?: string;
  children: ReactNode;
}) {
  const [open, setOpenState] = useState(false);
  // The drawer's code arrives after the page (audit B3): warmed once the page
  // is idle, fetched at once if a tap comes first, and opened as soon as it is here.
  const [NavDrawer, fetchNow] = useLoadedLater(loadPanel);
  const setOpen = useCallback(
    (next: boolean) => {
      if (next) fetchNow();
      setOpenState(next);
    },
    [fetchNow],
  );

  return (
    <NavDrawerContext.Provider value={{ open, setOpen }}>
      {children}
      {viewer && NavDrawer ? (
        <NavDrawer open={open} onOpenChange={setOpen} secondary={secondary} pathname={pathname} groupLabels={viewer.labels?.groups} />
      ) : null}
    </NavDrawerContext.Provider>
  );
}

/** The hamburger, top left of every signed-in screen that isn't a subpage. */
export function NavDrawerTrigger({ className }: { className?: string }) {
  const { setOpen } = useNavDrawer();
  return (
    <button
      type="button"
      aria-label="Open menu"
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]",
        className,
      )}
    >
      <Menu className="size-5" />
    </button>
  );
}

/** The bottom tab bar's "More" — opens the same drawer instead of navigating away. */
export function MoreTabButton({
  isActive,
  className,
  children,
}: {
  isActive: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { setOpen } = useNavDrawer();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-current={isActive ? "page" : undefined}
      onClick={() => setOpen(true)}
      className={className}
    >
      {children}
    </button>
  );
}
