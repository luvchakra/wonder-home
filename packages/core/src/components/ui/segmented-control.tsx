import Link from "next/link";
import { cn } from "../../lib/cn";
import { SegmentInView } from "./segment-in-view";

/**
 * The pill-shaped tab row the mockups put under a page title: "My day · Family
 * · Household".
 *
 * Tabs are links rather than client state, so a tab is a URL — deep-linkable,
 * shareable, back-button-friendly, and rendered on the server with no script
 * to wait for. The active tab is marked with aria-current so assistive
 * technology hears which it is.
 */
export type Segment = { key: string; label: string; href: string; count?: number };

export function SegmentedControl({
  segments,
  active,
  label,
  className,
}: {
  segments: readonly Segment[];
  active: string;
  /** What this row chooses between, for screen readers. */
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none]", className)}>
      <SegmentInView />
      {/* Fits the screen it is on (the owner, 2026-10-20: no overflow): each tab
          takes an equal share, a label wraps to a second line before it is ever
          cut, and only a row that cannot fit even then scrolls. */}
      <ul className="flex w-full gap-0.5 rounded-[var(--wh-radius-lg)] bg-[var(--wh-surface-muted)] p-1">
        {segments.map((segment) => {
          const isActive = segment.key === active;
          return (
            <li key={segment.key} className="flex-1">
              <Link
                href={segment.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-full min-h-9 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-[var(--wh-radius-pill)] px-1.5 py-1 text-center text-[0.8125rem] leading-tight font-semibold transition-colors min-[400px]:px-2.5 sm:px-3.5",
                  isActive
                    ? "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] shadow-[var(--wh-shadow-primary)]"
                    : "text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface)] hover:text-[var(--wh-foreground)]",
                )}
              >
                {segment.label}
                {typeof segment.count === "number" && segment.count > 0 ? (
                  <span
                    className={cn(
                      "grid min-w-5 place-items-center rounded-full px-1 text-[0.625rem] font-bold",
                      isActive
                        ? "bg-[var(--wh-primary-foreground)]/20 text-[var(--wh-primary-foreground)]"
                        : "bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)]",
                    )}
                  >
                    {segment.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
