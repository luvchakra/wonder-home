import type { ComponentType, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";

/**
 * The day as a vertical timeline: time on the left, what happens on the right.
 *
 * Only meaningful items belong here — a commute, a pickup, dinner, something
 * that needs a reply. A finished item is shown with a tick and never asks to be
 * ticked; normal household work is not a to-do list.
 */
export type TimelineItem = {
  key: string;
  /** Already formatted for the household's zone, e.g. "6:30 PM". */
  time: string;
  title: string;
  meta?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: IconTone;
  state?: "done" | "now" | "upcoming" | "needs_you";
  /** One thing to do, usually a Pill. */
  action?: ReactNode;
};

export function Timeline({ items, className }: { items: readonly TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-1", className)}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <li key={item.key} className="relative flex gap-3">
            <div className="w-14 shrink-0 pt-3 text-right text-[0.6875rem] font-medium text-[var(--wh-foreground-subtle)] tabular-nums">
              {item.time}
            </div>

            <div className="relative flex flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  "mt-3.5 size-2.5 shrink-0 rounded-full ring-4 ring-[var(--wh-background)]",
                  item.state === "done" && "bg-[var(--wh-handled)]",
                  item.state === "now" && "bg-[var(--wh-primary)] shadow-[0_0_0_4px_var(--wh-primary-soft)]",
                  item.state === "needs_you" && "bg-[var(--wh-attention)]",
                  (!item.state || item.state === "upcoming") && "bg-[var(--wh-border-strong)]",
                )}
              />
              {!last ? <span aria-hidden className="w-px flex-1 bg-[var(--wh-border)]" /> : null}
            </div>

            <div
              className={cn(
                "mb-2 flex min-w-0 flex-1 items-center gap-3 rounded-[var(--wh-radius-sm)] border bg-[var(--wh-surface)] px-3 py-2.5",
                item.state === "now"
                  ? "border-[var(--wh-primary-soft)] shadow-[var(--wh-shadow-card)]"
                  : "border-[var(--wh-border)]",
                item.state === "done" && "opacity-70",
              )}
            >
              <IconTile icon={item.icon} tone={item.tone ?? "primary"} size="sm" />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium", item.state === "done" && "line-through decoration-[var(--wh-foreground-subtle)]")}>
                  {item.title}
                </p>
                {item.meta ? (
                  <p className="truncate text-xs text-[var(--wh-foreground-subtle)]">{item.meta}</p>
                ) : null}
              </div>
              {item.action ? <div className="shrink-0">{item.action}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
