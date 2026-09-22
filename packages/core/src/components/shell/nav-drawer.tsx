"use client";

import { ChevronRight, House, LifeBuoy, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { createContext, useContext, useState, type ReactNode } from "react";

import { signOut } from "../../identity/session-actions";
import { cn } from "../../lib/cn";
import { groupSecondaryNavigation, type SecondaryNavItem } from "../../navigation/secondary-navigation";
import { Wordmark } from "../ui/brand";
import { HomeIllustration } from "../ui/home-illustration";
import { IconTile } from "../ui/icon-tile";
import { LeafDecor } from "../ui/leaf-decor";
import { ScriptAccent } from "../ui/script-accent";
import type { ShellViewer } from "./mobile-header";
import { SECONDARY_ICONS, SidebarLink } from "./primary-nav";

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
  const [open, setOpen] = useState(false);

  return (
    <NavDrawerContext.Provider value={{ open, setOpen }}>
      {children}
      {viewer ? <NavDrawer open={open} onOpenChange={setOpen} secondary={secondary} pathname={pathname} /> : null}
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

function NavDrawer({
  open,
  onOpenChange,
  secondary,
  pathname,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secondary: readonly SecondaryNavItem[];
  pathname?: string;
}) {
  const close = () => onOpenChange(false);
  const sections = groupSecondaryNavigation(secondary);

  const isCurrent = (href: string) => Boolean(pathname && (pathname === href || pathname.startsWith(`${href}/`)));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="wh-rise fixed inset-0 z-50 bg-[oklch(0.27_0.05_255/0.35)] backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "wh-slide-in-left fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(20rem,85vw)] flex-col overflow-y-auto",
            "bg-[var(--wh-surface)] pb-[env(safe-area-inset-bottom)] shadow-[var(--wh-shadow-float)] outline-none",
          )}
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>

          {/* The warm hero banner every signed-out screen already opens
              with (rule 5's botanical framing, the same wh-gradient-hero +
              LeafDecor + HomeIllustration recipe `auth-layout.tsx` and the
              landing hero use) — now the drawer's own opening too, since it
              is the one other place a household sees the full brand at
              once. The safe-area top padding moved here from the content
              wrapper so the gradient itself reaches the notch. `shrink-0`
              is load-bearing: this is a flex item in the drawer's flex-col
              column, and an overflow-hidden flex item's automatic min-height
              is 0 by spec — without it, the `nav`'s own flex-1 below wins
              the fight for space and the whole banner collapses to nothing
              taller than its own padding. */}
          <div
            className="relative shrink-0 overflow-hidden px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-5"
            style={{ background: "var(--wh-gradient-hero)" }}
          >
            <LeafDecor corner="top-right" size={130} opacity={0.3} />
            <HomeIllustration className="pointer-events-none absolute -top-2 -right-16 w-44 opacity-80" />

            <div className="relative flex items-start justify-between gap-2">
              <Link href="/" onClick={close} className="min-w-0">
                <Wordmark tagline taglineClassName="max-w-[10rem] truncate" />
              </Link>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--wh-surface)]/75 text-[var(--wh-foreground-muted)] backdrop-blur-sm hover:bg-[var(--wh-surface)]"
                >
                  <X className="size-5" />
                </button>
              </Dialog.Close>
            </div>

            <ScriptAccent tone="primary" size="sm" heart className="relative mt-4">
              A happier home together
            </ScriptAccent>
          </div>

          {/* Certification is "what WonderHome believes", the closest thing
              this menu has to "how the household is doing" — rather than a
              second, differently-worded way into Manage Household below. */}
          <Link
            href="/certification"
            onClick={close}
            className="mx-2 mt-3 flex items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3 shadow-[var(--wh-shadow-card)] transition-colors hover:bg-[var(--wh-surface-muted)]"
          >
            <IconTile icon={House} tone="handled" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">A happier home together</span>
              <span className="block text-xs text-[var(--wh-foreground-muted)]">Plan. Organize. Share. Enjoy.</span>
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
          </Link>

          <nav aria-label="Household menu" className="mt-2 flex-1 space-y-5 px-2 pb-6">
            {sections.map((section) => (
              <DrawerSection key={section.group} title={section.label} items={section.items} isCurrent={isCurrent} onNavigate={close} />
            ))}

            <ul className="space-y-0.5 border-t border-[var(--wh-border)] pt-3">
              <li>
                <SidebarLink href="/help" icon={LifeBuoy} label="Get Help" active={isCurrent("/help")} onClick={close} size="lg" />
              </li>
            </ul>
          </nav>

          {/* A real sign-out, not a link: this is a POST, so nothing that
              merely lands on this page can trigger it (rule from the
              session-cookie tests). */}
          <form action={signOut} className="border-t border-[var(--wh-border)] px-4 py-3">
            <button
              type="submit"
              className="flex items-center gap-2 text-sm font-medium text-[var(--wh-risk)] hover:underline"
            >
              <LogOut aria-hidden className="size-4" /> Log out
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DrawerSection({
  title,
  items,
  isCurrent,
  onNavigate,
}: {
  title: string;
  items: readonly SecondaryNavItem[];
  isCurrent: (href: string) => boolean;
  onNavigate: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 px-3 text-[0.625rem] font-semibold tracking-[0.12em] text-[var(--wh-foreground-subtle)] uppercase">
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.key}>
            <SidebarLink
              href={item.href}
              icon={SECONDARY_ICONS[item.icon]}
              label={item.label}
              tone={item.tone}
              active={isCurrent(item.href)}
              onClick={onNavigate}
              size="lg"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
