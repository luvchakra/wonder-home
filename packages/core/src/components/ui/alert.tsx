import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export type AlertProps = {
  tone?: "risk" | "attention" | "info";
  children: ReactNode;
  className?: string;
};

/** A message the person needs to read, announced as it appears. */
export function Alert({ tone = "risk", children, className }: AlertProps) {
  return (
    <p
      role="alert"
      className={cn(
        "rounded-[var(--wh-radius-sm)] px-3 py-2 text-sm",
        tone === "risk" && "bg-[var(--wh-risk-soft)] text-[var(--wh-risk)]",
        tone === "attention" && "bg-[var(--wh-attention-soft)] text-[var(--wh-attention)]",
        tone === "info" && "bg-[var(--wh-info-soft)] text-[var(--wh-info)]",
        className,
      )}
    >
      {children}
    </p>
  );
}
