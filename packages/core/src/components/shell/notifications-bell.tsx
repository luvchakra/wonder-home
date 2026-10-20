"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "../../lib/cn";

/**
 * The header's bell. On the notifications screen it shows as the place you
 * are — filled and tinted in the active-nav blue (rule 3), with
 * `aria-current` — the way a tab shows it is open (the owner, 2026-10-21).
 */
export function NotificationsBell({ unread, label }: { unread: number; label: string }) {
  const here = usePathname()?.startsWith("/notifications") ?? false;
  return (
    <Link
      href="/notifications"
      aria-label={label}
      aria-current={here ? "page" : undefined}
      className={cn(
        "relative grid size-11 place-items-center rounded-full transition-colors",
        here ? "bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]" : "text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]",
      )}
    >
      <Bell className="size-5" fill={here ? "currentColor" : "none"} />
      {unread ? <span aria-hidden className="absolute end-2.5 top-2.5 size-2 rounded-full bg-[var(--wh-attention)] ring-2 ring-[var(--wh-surface)]" /> : null}
    </Link>
  );
}
