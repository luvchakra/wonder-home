import Link from "next/link";
import type { ComponentProps, ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * The small rounded action on a row — "Pay", "Review", "Plan".
 *
 * Deliberately one word wherever possible: a row's action has to be readable at
 * a glance on a phone, next to text that is already competing for the width.
 */
const BASE =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--wh-radius-pill)] px-3.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]";

const TONE = {
  primary: "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] hover:bg-[var(--wh-primary-hover)]",
  soft: "bg-[var(--wh-primary-soft)] text-[var(--wh-primary)] hover:brightness-95",
  quiet:
    "border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]",
} as const;

export type PillTone = keyof typeof TONE;

export type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: PillTone };

export function Pill({ tone = "soft", className, ...props }: PillProps) {
  return <button {...props} className={cn(BASE, TONE[tone], className)} />;
}

export function PillLink({
  tone = "soft",
  className,
  ...props
}: ComponentProps<typeof Link> & { tone?: PillTone }) {
  return <Link {...props} className={cn(BASE, TONE[tone], className)} />;
}

/** A non-interactive state label: "Done", "On track", "Needs review". */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "attention" | "risk" | "handled";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--wh-radius-pill)] px-2.5 py-1 text-[0.6875rem] font-semibold",
        tone === "neutral" && "bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-muted)]",
        tone === "attention" && "bg-[var(--wh-attention-soft)] text-[var(--wh-attention)]",
        tone === "risk" && "bg-[var(--wh-risk-soft)] text-[var(--wh-risk)]",
        tone === "handled" && "bg-[var(--wh-handled-soft)] text-[var(--wh-handled)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
