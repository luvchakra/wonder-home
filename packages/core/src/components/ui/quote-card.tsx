import { cn } from "../../lib/cn";

/**
 * The soft line the mockups close a screen with.
 *
 * It is decoration, and it is labelled as such for assistive technology rather
 * than read out as if it were household information.
 */
export function QuoteCard({ children, className }: { children: string; className?: string }) {
  return (
    <aside
      aria-label="Encouragement"
      className={cn(
        "rounded-[var(--wh-radius)] bg-[var(--wh-primary-soft)] px-5 py-6 text-center",
        className,
      )}
    >
      <p className="text-balance text-sm font-medium italic text-[var(--wh-primary)]">{children}</p>
    </aside>
  );
}
