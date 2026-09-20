import { Bell, ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { Wordmark } from "../ui/brand";
import { SearchBar } from "../ui/search-bar";
import { NavDrawerTrigger } from "./nav-drawer";
import { ViewerMenu } from "./viewer-menu";

/**
 * The top of every signed-in screen: the mark, search, notifications and the
 * person. On a phone it is compact and sticky; on desktop the same bar spans
 * the content column and grows a full search field.
 */
export type ShellViewer = {
  displayName: string;
  roleLabel: string;
  householdName: string;
  /** Unread notifications, shown as a dot rather than a count — sparse, never a tally. */
  unread?: number;
};

export function MobileHeader({
  viewer,
  back,
  title,
  trailing,
  className,
}: {
  viewer?: ShellViewer;
  /** A subpage: show a back chevron to this href instead of the mark. */
  back?: { href: string; label: string };
  title?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "wh-glass sticky top-0 z-30 border-b border-[var(--wh-border)]/70 pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      <div className="mx-auto flex h-[var(--wh-header-height)] max-w-[var(--wh-content-wide)] items-center gap-3 px-4 lg:px-8">
        {back ? (
          <Link
            href={back.href}
            aria-label={back.label}
            className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
          >
            <ChevronLeft className="size-5" />
          </Link>
        ) : (
          <NavDrawerTrigger className="-ml-2 shrink-0 lg:hidden" />
        )}

        {title ? (
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight lg:hidden">{title}</h1>
        ) : (
          <span className="min-w-0 flex-1 lg:hidden">
            <Wordmark size={0} className="[&_svg]:hidden" />
          </span>
        )}

        <div className="hidden min-w-0 flex-1 lg:block">
          <SearchBar className="max-w-lg" />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {trailing}
          {viewer ? (
            <>
              <Link
                href="/notifications"
                aria-label={viewer.unread ? `Notifications, ${viewer.unread} unread` : "Notifications"}
                className="relative grid size-11 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
              >
                <Bell className="size-5" />
                {viewer.unread ? (
                  <span aria-hidden className="absolute top-2.5 right-2.5 size-2 rounded-full bg-[var(--wh-attention)] ring-2 ring-[var(--wh-surface)]" />
                ) : null}
              </Link>
              <ViewerMenu viewer={viewer} />
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
