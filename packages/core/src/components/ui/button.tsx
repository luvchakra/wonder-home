import Link from "next/link";
import type { ComponentProps, ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const BASE = [
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--wh-radius-sm)] px-4 text-sm font-medium transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
  "disabled:cursor-not-allowed disabled:opacity-60",
].join(" ");

function variantClass(variant: ButtonVariant): string {
  switch (variant) {
    case "primary":
      return "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] hover:bg-[var(--wh-primary-hover)]";
    case "secondary":
      return "border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground)] hover:bg-[var(--wh-surface-muted)]";
    case "quiet":
      return "text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)]";
  }
}

/**
 * Touch targets stay at least 44px tall: the UI spec requires mobile-usable
 * targets, and every action in this product is reachable on a phone.
 */
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button {...props} className={cn(BASE, variantClass(variant), className)} />;
}

/**
 * The same shape when the thing is a navigation rather than an action.
 *
 * A link is an anchor. Wrapping a button in one produces interactive content
 * inside interactive content, which breaks keyboard and screen-reader
 * behaviour even though it looks identical.
 */
export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...props} className={cn(BASE, variantClass(variant), className)} />;
}
