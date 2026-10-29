"use client";

import { Download, Info, LifeBuoy, LogOut, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { useRef, useState } from "react";

import { signOut } from "../../identity/session-actions";
import { cn } from "../../lib/cn";
import { installInstructions, useInstallPrompt } from "../../pwa/use-install-prompt";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";
import type { ShellViewer } from "./mobile-header";
import { VIEWER_TRIGGER_CLASS, viewerMenuLabel } from "./viewer-menu-trigger";

/**
 * The avatar menu, loaded after the page (performance audit B3): `ViewerMenu`
 * in `viewer-menu.tsx` shows the avatar until the first tap, then this.
 *
 * The avatar used to be a plain link to Settings, which left nowhere to put
 * anything else and gave no hint that it led there. It is now a menu, which
 * is also where Get Help belongs: help is the thing people look for when
 * they are already lost, so it has to be somewhere they can find without
 * knowing the information architecture.
 *
 * Radix rather than a hand-rolled popover, because the parts that are easy
 * to get wrong — focus moving into and back out of the menu, escape, the
 * outside click, arrow keys, and announcing that the trigger opens something
 * — are the parts Radix has already got right.
 *
 * "Install app" lives here too: the product is a PWA, and the one place a
 * person looks for "put this on my phone" is their own account menu. Where
 * the browser offers a native prompt it is shown; where it does not, the
 * browser's own steps are spelled out. Gone once the app is installed.
 */
const ITEMS = [
  { href: "/settings/profile", label: "Profile", icon: UserRound },
  { href: "/help", label: "Get Help", icon: LifeBuoy },
] as const;
// HomeBrain ("What WonderHome believes") is reached from More, not from here
// as well (design/UI-SIMPLIFICATION-v1.md M7: one door per page).

const ITEM_CLASS =
  "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-[var(--wh-radius-sm)] px-2 text-left text-sm outline-none data-[highlighted]:bg-[var(--wh-surface-muted)]";

export default function ViewerMenuContent({ viewer, defaultOpen }: { viewer: ShellViewer; defaultOpen: boolean }) {
  const install = useInstallPrompt();
  const [guide, setGuide] = useState(false);
  // Back to the avatar on close, also when the menu first opened by itself
  // (a tap before this code arrived, `defaultOpen`) and Radix never saw it.
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
    <DropdownMenu.Root defaultOpen={defaultOpen}>
      <DropdownMenu.Trigger ref={trigger} aria-label={viewerMenuLabel(viewer)} className={VIEWER_TRIGGER_CLASS}>
        <Avatar name={viewer.displayName} size="sm" imageUrl={viewer.avatarUrl ?? undefined} />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
          className="z-50 min-w-56 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-1.5 shadow-[var(--wh-shadow-float)]"
        >
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={viewer.displayName} size="sm" imageUrl={viewer.avatarUrl ?? undefined} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{viewer.displayName}</p>
              <p className="text-xs text-[var(--wh-foreground-subtle)]">
                {viewer.roleLabel} · {viewer.householdName}
              </p>
            </div>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-[var(--wh-border)]" />

          {ITEMS.map((item) => (
            <DropdownMenu.Item key={item.href} asChild>
              <Link
                href={item.href}
                className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[var(--wh-radius-sm)] px-2 text-sm outline-none data-[highlighted]:bg-[var(--wh-surface-muted)]"
              >
                <item.icon aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
                {item.label}
              </Link>
            </DropdownMenu.Item>
          ))}

          {viewer.platformAdmin ? (
            <DropdownMenu.Item asChild>
              <Link href={viewer.platformAdmin.href} className={cn(ITEM_CLASS, "min-h-11")}>
                <ShieldCheck aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
                {viewer.platformAdmin.label}
              </Link>
            </DropdownMenu.Item>
          ) : null}

          {install.installed ? null : (
            <DropdownMenu.Item
              className={ITEM_CLASS}
              onSelect={() => {
                if (install.canPrompt) void install.prompt();
                else setGuide(true);
              }}
            >
              <Download aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
              Install app
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className="my-1 h-px bg-[var(--wh-border)]" />

          {/* About, where "Everything else" was (the owner, 2026-10-21): the More
              tab already leads to everything else. */}
          <DropdownMenu.Item asChild>
            <Link
              href="/about"
              className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[var(--wh-radius-sm)] px-2 text-sm outline-none data-[highlighted]:bg-[var(--wh-surface-muted)]"
            >
              <Info aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
              {viewer.labels?.about ?? "About WonderHome"}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-[var(--wh-border)]" />

          {/* A real sign-out, not a link: this is a POST, so nothing that
              merely lands on this page can trigger it (rule from the
              session-cookie tests). */}
          <DropdownMenu.Item asChild>
            <form action={signOut}>
              <button type="submit" className={cn(ITEM_CLASS, "text-[var(--wh-risk)]")}>
                <LogOut aria-hidden className="size-4" />
                {viewer.labels?.logout ?? "Log out"}
              </button>
            </form>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>

    <Sheet
      open={guide}
      onOpenChange={setGuide}
      title="Install WonderHome"
      description="Put it on your home screen and it opens like an app — full screen, no address bar."
    >
      <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--wh-foreground-muted)]">
        {installInstructions(install.platform).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Button type="button" className="mt-5 w-full" onClick={() => setGuide(false)}>
        Got it
      </Button>
    </Sheet>
    </>
  );
}
