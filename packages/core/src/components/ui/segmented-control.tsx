import { cn } from "../../lib/cn";

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
    <nav aria-label={label} className={cn("-mx-4 overflow-x-auto px-4 [scrollbar-width:none]", className)}>
      <ul className="inline-flex min-w-full gap-1 rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] p-1">
        {segments.map((segment) => {
          const isActive = segment.key === active;
          return (
            <li key={segment.key} className="flex-1">
              <a
                href={segment.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--wh-radius-pill)] px-3.5 text-[0.8125rem] font-semibold transition-colors",
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
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
