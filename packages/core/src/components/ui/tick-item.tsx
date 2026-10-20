import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

/** The class that strikes a row's main text through once it is ticked. */
export const TICK_STRIKE = "group-has-[:checked]:line-through";

/**
 * A list row a person ticks off while they work through it — an ingredient set
 * out, a recipe step done (the owner, 2026-10-20: "tick mark checkboxes
 * against each ingredient and step, just a UI level checkbox for immediate
 * tracking, nothing needs to be persisted").
 *
 * The whole row is the tap target (a `<label>` around a real checkbox), so
 * it works with a keyboard and a screen reader and needs no script. Nothing is
 * saved; a reload starts fresh. A ticked row fades and its main text is struck
 * through (give that text `TICK_STRIKE`), but stays readable (rule 15), and the tick says "done" in its own
 * shape, not only by colour (rule 3).
 *
 * `marker` puts the tick where a step's number sits (the number turns into the
 * tick); without it the tick box sits at the row's end.
 */
export function TickItem({
  children,
  label,
  marker,
  className,
}: {
  children: ReactNode;
  /** What ticking it means, for assistive technology ("Rice, set out"). */
  label: string;
  /** A step's number, shown until ticked. */
  marker?: number;
  className?: string;
}) {
  const tick = (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center border-2 border-[var(--wh-border-strong,var(--wh-border))] text-[var(--wh-primary-foreground)] transition-colors",
        "group-has-[:checked]:border-[var(--wh-handled)] group-has-[:checked]:bg-[var(--wh-handled)]",
        "group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-[var(--wh-primary)] group-has-[:focus-visible]:ring-offset-2",
        marker === undefined ? "size-6 rounded-md" : "size-7 rounded-full border-transparent bg-[var(--wh-surface-muted)]",
      )}
    >
      {marker !== undefined ? <span className="text-xs font-bold text-[var(--wh-foreground)] group-has-[:checked]:hidden">{marker}</span> : null}
      <Check className={cn("size-4 stroke-[3] opacity-0 group-has-[:checked]:opacity-100", marker !== undefined && "hidden group-has-[:checked]:block")} />
    </span>
  );
  return (
    <li className={className}>
      <label className={cn("group flex min-h-11 cursor-pointer gap-3 select-none", marker === undefined ? "items-center" : "items-start")}>
        <input type="checkbox" aria-label={label} className="sr-only" />
        {marker !== undefined ? tick : null}
        <span className="flex min-w-0 flex-1 items-center gap-3 transition-opacity group-has-[:checked]:opacity-55">
          {children}
        </span>
        {marker === undefined ? tick : null}
      </label>
    </li>
  );
}
