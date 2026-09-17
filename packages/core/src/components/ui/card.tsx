import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export type CardProps = {
  children: ReactNode;
  className?: string;
};

/** The one card surface: white, rounded, softly elevated, generously padded. */
export function Card({ children, className }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4 shadow-[var(--wh-shadow-card)]",
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
