import { cn } from "../../lib/cn";

import { ScriptAccent } from "./script-accent";

/**
 * The line the mockups close a screen with.
 *
 * In the sheets this is not a banner but a soft handwritten note at the foot
 * of the page — "Small steps today. Happier tomorrows.", "A happy family is a
 * well-managed adventure." It is decoration, and it is marked as such rather
 * than read out as if it were household information.
 */
export function QuoteCard({ children, className }: { children: string; className?: string }) {
  return (
    <aside
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-[var(--wh-radius)] bg-[var(--wh-primary-soft)]/60 px-6 py-7 text-center",
        className,
      )}
    >
      <ScriptAccent tone="primary" size="sm" heart className="mx-auto max-w-sm">
        {children}
      </ScriptAccent>
    </aside>
  );
}
