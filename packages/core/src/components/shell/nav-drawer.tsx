"use client";

import { LifeBuoy, Menu, X } from "lucide-react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { createContext, useContext, useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import type { SecondaryNavItem } from "../../navigation/secondary-navigation";
import { Avatar } from "../ui/avatar";
import { Wordmark } from "../ui/brand";
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
      {viewer ? (
        <NavDrawer open={open} onOpenChange={setOpen} viewer={viewer} secondary={secondary} pathname={pathname} />
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

function NavDrawer({
  open,
  onOpenChange,
  viewer,
  secondary,
  pathname,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewer: ShellViewer;
  secondary: readonly SecondaryNavItem[];
  pathname?: string;
}) {
  const close = () => onOpenChange(false);
  const domains = secondary.filter((item) => !["manage", "settings", "notifications"].includes(item.key));
  const manage = secondary.filter((item) => ["manage", "notifications", "settings"].includes(item.key));

  const isCurrent = (href: string) => Boolean(pathname && (pathname === href || pathname.startsWith(`${href}/`)));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="wh-rise fixed inset-0 z-50 bg-[oklch(0.27_0.05_255/0.35)] backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "wh-slide-in-left fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(20rem,85vw)] flex-col overflow-y-auto",
            "bg-[var(--wh-surface)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[var(--wh-shadow-float)] outline-none",
          )}
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>

          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
            <Link href="/" onClick={close} className="min-w-0">
              <Wordmark />
            </Link>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
              >
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>

          <Link
            href="/settings"
            onClick={close}
            className="mx-2 mt-2 flex items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2.5 hover:bg-[var(--wh-surface-muted)]"
          >
            <Avatar name={viewer.displayName} size="md" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{viewer.displayName}</span>
              <span className="block text-xs text-[var(--wh-foreground-muted)]">
                {viewer.roleLabel} · {viewer.householdName}
              </span>
            </span>
          </Link>

          <nav aria-label="Household menu" className="mt-2 flex-1 space-y-5 px-2 pb-6">
            <DrawerSection title="Household" items={domains} isCurrent={isCurrent} onNavigate={close} />
            <DrawerSection title="Manage" items={manage} isCurrent={isCurrent} onNavigate={close} />

            <ul className="space-y-0.5 border-t border-[var(--wh-border)] pt-3">
              <li>
                <SidebarLink href="/help" icon={LifeBuoy} label="Get Help" active={isCurrent("/help")} onClick={close} size="lg" />
              </li>
            </ul>
          </nav>
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
