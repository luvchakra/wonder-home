"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { Dialog } from "radix-ui";

import { cn } from "../../lib/cn";
import { groupSecondaryNavigation, type SecondaryNavItem } from "../../navigation/secondary-navigation";
import { Wordmark } from "../ui/brand";
import { HomeIllustration } from "../ui/home-illustration";
import { LeafDecor } from "../ui/leaf-decor";
import { ScriptAccent } from "../ui/script-accent";
import type { ShellLabels } from "./mobile-header";
import { SECONDARY_ICONS, SidebarLink } from "./primary-nav";

/**
 * The drawer itself, in a module of its own so Radix Dialog and the menu's
 * contents load after the page, not with every screen's first JavaScript
 * (performance audit B3). `NavDrawerProvider` mounts it the first time it
 * opens, and warms it once the page is idle so that first tap is instant.
 */
export default function NavDrawer({
  open,
  onOpenChange,
  secondary,
  pathname,
  groupLabels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secondary: readonly SecondaryNavItem[];
  pathname?: string;
  groupLabels?: ShellLabels["groups"];
}) {
  const close = () => onOpenChange(false);
  // Settings' door is the account menu (design/UI-SIMPLIFICATION-v1.md M7).
  const sections = groupSecondaryNavigation(
    secondary.filter((item) => item.key !== "settings"),
    groupLabels,
  );

  const isCurrent = (href: string) => Boolean(pathname && (pathname === href || pathname.startsWith(`${href}/`)));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="wh-rise fixed inset-0 z-50 bg-[oklch(0.27_0.05_255/0.35)] backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "wh-slide-in-left fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(20rem,85vw)] flex-col overflow-hidden",
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
            className="relative shrink-0 overflow-hidden px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2"
            style={{ background: "var(--wh-gradient-hero)" }}
          >
            <LeafDecor corner="top-right" size={96} opacity={0.25} />
            <HomeIllustration className="pointer-events-none absolute -top-1 -right-12 w-28 opacity-70" />

            <div className="relative flex items-start justify-between gap-2">
              <Link href="/" onClick={close} className="min-w-0">
                <Wordmark tagline taglineClassName="text-[0.4375rem] tracking-[0.08em]" />
              </Link>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--wh-surface)]/75 text-[var(--wh-foreground-muted)] backdrop-blur-sm hover:bg-[var(--wh-surface)]"
                >
                  <X className="size-5" />
                </button>
              </Dialog.Close>
            </div>

            <ScriptAccent tone="primary" size="sm" heart className="relative mt-1">
              A happier home together
            </ScriptAccent>
          </div>

          {/* The list is the only thing that scrolls: the hero above stays put
              (`shrink-0`) and this `nav` takes the rest of the column and
              scrolls within it, so on the shortest phones the full set is
              reachable without the brand header sliding away — and on a
              standard phone it all fits at once with nothing clipped. */}
          <nav aria-label="Household menu" className="mt-1 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            {sections.map((section) => (
              <DrawerSection key={section.group} title={section.label} items={section.items} isCurrent={isCurrent} onNavigate={close} />
            ))}
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
      <p className="mb-0.5 px-3 text-[0.625rem] font-semibold tracking-[0.12em] text-[var(--wh-foreground-subtle)] uppercase">
        {title}
      </p>
      <ul className="space-y-px">
        {items.map((item) => (
          <li key={item.key}>
            <SidebarLink
              href={item.href}
              icon={SECONDARY_ICONS[item.icon]}
              label={item.label}
              tone={item.tone}
              badge={item.badge}
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
