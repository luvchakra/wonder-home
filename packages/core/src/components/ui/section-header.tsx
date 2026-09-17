import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * A section title with, at most, one way onward.
 *
 * The count belongs beside the title rather than in a badge far from it: "3"
 * on its own is a number, "Needs your attention 3" is a sentence.
 */
export function SectionHeader({
  title,
  count,
  action,
  className,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-2 flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold tracking-tight">
        {title}
        {typeof count === "number" && count > 0 ? (
          <span className="grid size-5 place-items-center rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary)] text-[0.625rem] font-bold text-[var(--wh-primary-foreground)]">
            {count}
          </span>
        ) : null}
      </h2>
      {action}
    </header>
  );
}
