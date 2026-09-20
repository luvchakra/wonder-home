import type { CSSProperties, ReactNode } from "react";

import { cn } from "../../lib/cn";

export type CardProps = {
  children: ReactNode;
  className?: string;
  /** Anchor target, for a card a link elsewhere on the page points at. */
  id?: string;
  /** For the stagger delay a rising card sets, and nothing that belongs in a class. */
  style?: CSSProperties;
};

/** The one card surface: white, rounded, softly elevated, generously padded. */
export function Card({ children, className, id, style }: CardProps) {
  return (
    <section
      id={id}
      style={style}
      className={cn(
        // The brand mark's halo follows the surface it sits on, so a card
        // re-declares it for everything inside rather than every screen
        // passing it down by hand.
        "rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4 shadow-[var(--wh-shadow-card)]",
        "[--wh-brand-surface:var(--wh-surface)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return <header className={cn("mb-3 flex items-center gap-2", className)}>{children}</header>;
}

export function CardTitle({ children, className }: CardProps) {
  return <h2 className={cn("text-base font-semibold tracking-tight", className)}>{children}</h2>;
}
