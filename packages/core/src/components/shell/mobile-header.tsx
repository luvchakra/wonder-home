import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { NotificationsBell } from "./notifications-bell";
import type { InstallBannerLabels } from "../../pwa/install-labels";
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
  /** Their photo from Family, signed; their initials when there is none. */
  avatarUrl?: string | null;
  roleLabel: string;
  householdName: string;
  /** Unread notifications, shown as a dot rather than a count — sparse, never a tally. */
  unread?: number;
  /** The language the shell speaks in, and its direction (story 22-004). */
  language?: string;
  dir?: "ltr" | "rtl";
  /** The shell's own words in that language. Anything absent stays in English. */
  labels?: ShellLabels;
  /** Set by the server for platform staff only; absent for everyone else, so nothing about it is sent. */
  platformAdmin?: { href: string; label: string };
  /**
   * A child's view of the app (story 08-017): the brighter look, and the stars
   * they have counted from what they did, beside the bell on every screen.
   */
  audience?: "child";
  stars?: { count: number; label: string };
};

export type ShellLabels = {
  nav?: Partial<Record<PrimaryNavKey, string>>;
  groups?: Partial<Record<SecondaryNavGroup, string>>;
  settings?: string;
  household?: string;
  logout?: string;
  /** The avatar menu's About WonderHome row. */
  about?: string;
  /** Said by the raised HomeTalk button while a conversation is in progress. */
  talking?: string;
  /** The install banner's words (story 00-011); English when absent. */
  install?: InstallBannerLabels;
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
        "wh-glass wh-chrome-top sticky top-0 z-30 border-b border-[var(--wh-border)]/70 pt-[env(safe-area-inset-top)]",
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
                nameClassName="text-[min(1.0625rem,4.6vw)]"
                taglineClassName="text-[min(0.65rem,2.4vw)] font-medium tracking-normal whitespace-nowrap normal-case"
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
              {viewer.stars ? (
                <Link
                  href="/?tab=goals"
                  aria-label={viewer.stars.label}
                  className="wh-kid-stars hidden h-9 items-center gap-1 rounded-full px-2.5 text-sm font-bold whitespace-nowrap sm:inline-flex"
                >
                  <span aria-hidden>⭐</span>
                  {viewer.stars.count}
                </Link>
              ) : null}
              <NotificationsBell unread={viewer.unread ?? 0} label={viewer.unread ? `Notifications, ${viewer.unread} unread` : "Notifications"} />
              {viewer.stars ? (
                // On a phone the count rides on the avatar, so the wordmark keeps its room (rule 15).
                <span className="relative">
                  <ViewerMenu viewer={viewer} />
                  <span aria-hidden className="wh-kid-stars pointer-events-none absolute -end-1 -bottom-1 rounded-full px-1.5 text-[0.625rem] leading-4 font-bold sm:hidden">
                    ⭐{viewer.stars.count}
                  </span>
                </span>
              ) : (
                <ViewerMenu viewer={viewer} />
              )}
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
