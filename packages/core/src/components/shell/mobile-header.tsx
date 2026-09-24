import { Bell, ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import type { PrimaryNavKey } from "../../navigation/primary-navigation";
import type { SecondaryNavGroup } from "../../navigation/secondary-navigation";
import { BrandMark, Wordmark } from "../ui/brand";
import { SearchBar } from "../ui/search-bar";
import { NavDrawerTrigger } from "./nav-drawer";
import { ViewerMenu } from "./viewer-menu";

/**
 * The top of every signed-in screen: the mark, search, notifications and the
 * person. On a phone it is compact and sticky; on desktop the same bar spans
 * the content column and grows a full search field.
 *
 * On a phone, the mark sits in the flexible middle column between the
 * hamburger and the notification/avatar cluster, centred within whatever
 * room that leaves it — in flow, not positioned absolutely out of it, so it
 * can never sit on top of (and be clipped by) its neighbours once the
 * tagline makes it wider than the icon-only mark ever was (rule 15: show
 * the whole thing, never clip it). `min-w-0` on both the column and the
 * tagline itself means a genuinely too-narrow phone truncates the tagline
 * with an ellipsis rather than overflowing the row.
 */
export type ShellViewer = {
  displayName: string;
  roleLabel: string;
  householdName: string;
  /** Unread notifications, shown as a dot rather than a count — sparse, never a tally. */
  unread?: number;
  /** The language the shell speaks in, and its direction (story 22-004). */
  language?: string;
  dir?: "ltr" | "rtl";
  /** The shell's own words in that language. Anything absent stays in English. */
  labels?: ShellLabels;
};

export type ShellLabels = {
  nav?: Partial<Record<PrimaryNavKey, string>>;
  groups?: Partial<Record<SecondaryNavGroup, string>>;
  settings?: string;
  household?: string;
  logout?: string;
};

export function MobileHeader({
  viewer,
  back,
  title,
  search,
  trailing,
  className,
}: {
  viewer?: ShellViewer;
  /** A subpage: show a back chevron to this href instead of the mark. */
  back?: { href: string; label: string };
  title?: string;
  /** A screen's own search (HomeTalk's messages): the mark and this, in place of the title. */
  search?: ReactNode;
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
      <div className={cn("relative mx-auto flex h-[var(--wh-header-height)] max-w-[var(--wh-content-wide)] items-center px-4 lg:px-8", search ? "gap-1.5 lg:gap-3" : "gap-3")}>
        {back ? (
          <Link
            href={back.href}
            aria-label={back.label}
            className="-ms-2 grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
          >
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </Link>
        ) : (
          <NavDrawerTrigger className="-ms-2 shrink-0 lg:hidden" />
        )}

        {search ? (
          <>
            {title ? <h1 className="sr-only">{title}</h1> : null}
            <Link href="/" aria-label="WonderHome home" className="-ms-1 shrink-0 lg:hidden">
              <BrandMark size={28} />
            </Link>
            <div className="min-w-0 flex-1 lg:max-w-lg">{search}</div>
          </>
        ) : title ? (
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight lg:hidden">{title}</h1>
        ) : (
          <div className="flex min-w-0 flex-1 justify-center lg:hidden">
            <Link href="/" aria-label="WonderHome home" className="min-w-0">
              <Wordmark
                size={26}
                className="max-w-full"
                tagline
                taglineClassName="max-w-[13.5rem] text-[0.65rem] font-medium tracking-normal whitespace-normal normal-case"
              />
            </Link>
          </div>
        )}

        {search ? (
          <div aria-hidden className="hidden flex-1 lg:block" />
        ) : (
          <div className="hidden min-w-0 flex-1 lg:block">
            <SearchBar className="max-w-lg" />
          </div>
        )}

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
                  <span aria-hidden className="absolute end-2.5 top-2.5 size-2 rounded-full bg-[var(--wh-attention)] ring-2 ring-[var(--wh-surface)]" />
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
