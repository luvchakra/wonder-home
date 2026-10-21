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
 *
 * `trailing` is one control of the row's own that is not "open" — Family's
 * chat icon beside a person (story 12-015). It sits between the row and its
 * chevron, outside the toggle, because a link cannot live inside a button.
 * The chevron beside it still opens the row for a pointer; the row's own
 * button stays the one control a keyboard or screen reader uses.
 */
export function ExpandableRow({
  summary,
  children,
  className,
  trailing,
}: {
  /** Everything in the collapsed row except the chevron. */
  summary: ReactNode;
  /** One control of the row's own, shown before the chevron (an icon link with its own label). */
  trailing?: ReactNode;
  /** Revealed below the row once it is opened. */
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const chevron = (
    <ChevronDown
      aria-hidden
      className={cn(
        "size-4 shrink-0 text-[var(--wh-foreground-subtle)] transition-transform duration-200 motion-reduce:transition-none",
        open && "rotate-180",
      )}
    />
  );
  const toggleClass = cn(
    "flex min-h-14 w-full items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2.5 text-left transition-colors hover:bg-[var(--wh-primary-soft)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
    className,
  );

  return (
    <li>
      {trailing ? (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId} className={cn(toggleClass, "min-w-0 flex-1")}>
            {summary}
          </button>
          {trailing}
          {/* The same toggle for a pointer; the row's button above is the accessible one. */}
          <button type="button" tabIndex={-1} aria-hidden onClick={() => setOpen((value) => !value)} className="grid min-h-11 w-8 shrink-0 place-items-center">
            {chevron}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId} className={toggleClass}>
          {summary}
          {chevron}
        </button>
      )}
      {open ? (
        <div id={panelId} className="px-2 pt-1 pb-3">
          {children}
        </div>
      ) : null}
    </li>
  );
}
