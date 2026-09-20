"use client";

import { CircleUserRound, LifeBuoy, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";

import { Avatar } from "../ui/avatar";
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
 */
const ITEMS = [
  { href: "/settings", label: "Settings & profile", icon: Settings2 },
  { href: "/help", label: "Get Help", icon: LifeBuoy },
  { href: "/certification", label: "What WonderHome believes", icon: ShieldCheck },
] as const;

export function ViewerMenu({ viewer }: { viewer: ShellViewer }) {
  return (
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
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
