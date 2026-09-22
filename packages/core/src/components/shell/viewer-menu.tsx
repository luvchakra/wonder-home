"use client";

import { CircleUserRound, Download, LifeBuoy, LogOut, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";

import { signOut } from "../../identity/session-actions";
import { cn } from "../../lib/cn";
import { installInstructions, useInstallPrompt } from "../../pwa/use-install-prompt";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";
import type { ShellViewer } from "./mobile-header";

/**
 * The avatar menu.
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
  { href: "/settings", label: "Settings & Profile", icon: Settings2 },
  { href: "/help", label: "Get Help", icon: LifeBuoy },
  { href: "/certification", label: "What WonderHome believes", icon: ShieldCheck },
] as const;

const ITEM_CLASS =
  "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-[var(--wh-radius-sm)] px-2 text-left text-sm outline-none data-[highlighted]:bg-[var(--wh-surface-muted)]";

export function ViewerMenu({ viewer }: { viewer: ShellViewer }) {
  const install = useInstallPrompt();
  const [guide, setGuide] = useState(false);

  return (
    <>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`${viewer.displayName}, ${viewer.roleLabel}. Account menu`}
        className="ml-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
      >
        <Avatar name={viewer.displayName} size="sm" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-56 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-1.5 shadow-[var(--wh-shadow-float)]"
        >
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={viewer.displayName} size="sm" />
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

          <DropdownMenu.Item asChild>
            <Link
              href="/more"
              className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[var(--wh-radius-sm)] px-2 text-sm outline-none data-[highlighted]:bg-[var(--wh-surface-muted)]"
            >
              <CircleUserRound aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
              Everything else
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
                Log out
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
