"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * A row that opens in place instead of leaving the page.
 *
 * Built for exactly the case a right-pointing chevron used to promise
 * something it did not deliver: Home's family and househelp rows linked to
 * `/family?member=…`, a query the Family screen does not read, so the
 * chevron was a dead end dressed as navigation (rule 10). The chevron here
 * points down — "more, right here" — and turns to face up once opened;
 * `ChevronRight` stays reserved for a row that genuinely leaves the screen.
 *
 * `summary` and `children` are already-rendered JSX, which is the point:
 * a Server Component can hand this component finished markup (an `Avatar`,
 * an `IconTile`, plain text) without ever passing a component *function*
 * across the server/client boundary — only invoking `iconForOutcome` or
 * similar from inside a Client Component runs into that limit.
 */
export function ExpandableRow({
  summary,
  children,
  className,
}: {
  /** Everything in the collapsed row except the chevron. */
  summary: ReactNode;
  /** Revealed below the row once it is opened. */
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2.5 text-left transition-colors hover:bg-[var(--wh-primary-soft)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
          className,
        )}
      >
        {summary}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-[var(--wh-foreground-subtle)] transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div id={panelId} className="px-2 pt-1 pb-3">
          {children}
        </div>
      ) : null}
    </li>
  );
}
