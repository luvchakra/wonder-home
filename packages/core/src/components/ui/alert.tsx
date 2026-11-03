import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export type AlertProps = {
  tone?: "risk" | "attention" | "info";
  children: ReactNode;
  className?: string;
};

/**
 * A message the person needs to read, announced as it appears. A `div`, not a
 * `p`: an alert often carries its own Undo form, and a form inside a
 * paragraph is invalid HTML that breaks hydration (HomeSend, 2026-11-03).
 */
export function Alert({ tone = "risk", children, className }: AlertProps) {
  return (
    <div
      role="alert"
      data-wh-alert=""
      className={cn(
        "rounded-[var(--wh-radius-sm)] px-3 py-2 text-sm",
        tone === "risk" && "bg-[var(--wh-risk-soft)] text-[var(--wh-risk)]",
        tone === "attention" && "bg-[var(--wh-attention-soft)] text-[var(--wh-attention)]",
        tone === "info" && "bg-[var(--wh-info-soft)] text-[var(--wh-info)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
