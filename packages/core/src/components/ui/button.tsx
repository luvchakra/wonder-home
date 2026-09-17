import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
};

/**
 * Touch targets stay at least 44px tall: the UI spec requires mobile-usable
 * targets, and every action in this product is reachable on a phone.
 */
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--wh-radius-sm)] px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] hover:bg-[var(--wh-primary-hover)]",
        variant === "secondary" &&
          "border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground)] hover:bg-[var(--wh-surface-muted)]",
        variant === "quiet" && "text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)]",
        className,
      )}
    />
  );
}
