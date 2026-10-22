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
    <nav aria-label={label} className={cn("relative -mx-4 scroll-mt-16 overflow-x-auto px-4 [scrollbar-width:none]", className)}>
      <SegmentInView />
      {/* Fits the screen it is on (the owner, 2026-10-20: no overflow, and "the
          numeral is going in second row"): each tab is as wide as its own label
          and count, the spare room shared out, so a longer label takes the space
          a shorter one does not need and its count stays beside it. A label never
          breaks inside its tab (the owner, 2026-10-22: six setup tabs on a phone
          read "Who / does / what"); on a screen too narrow for every tab on one
          line, whole tabs move to a second line instead — never cut, never past
          the edge. */}
      <ul className="flex w-full flex-wrap gap-0.5 rounded-[var(--wh-radius-lg)] bg-[var(--wh-surface-muted)] p-1">
        {segments.map((segment) => {
          const isActive = segment.key === active;
          return (
            <li key={segment.key} className="flex-auto">
              <Link
                href={segment.href}
                // The row brings itself to the top (`SegmentInView`), so the page is not also sent to its own top.
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-full min-h-9 items-center justify-center gap-x-1.5 rounded-[var(--wh-radius-pill)] px-2.5 py-1 text-center text-[0.8125rem] leading-tight font-semibold whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] shadow-[var(--wh-shadow-primary)]"
                    : "text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface)] hover:text-[var(--wh-foreground)]",
                )}
              >
                <span>{segment.label}</span>
                {typeof segment.count === "number" && segment.count > 0 ? (
                  <span
                    className={cn(
                      "grid min-w-5 shrink-0 place-items-center rounded-full px-1 text-[0.625rem] font-bold",
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
