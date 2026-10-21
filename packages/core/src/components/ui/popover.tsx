"use client";

import { Popover as RadixPopover } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * A small floating panel anchored to the thing it acts on (FamilyChat's
 * message options and "who reacted", the owner, 2026-10-21). Radix keeps
 * focus, Escape and a tap outside right; this only gives it the kit's card
 * look. `anchor` is what it points at; `trigger` is a button that opens it.
 * With an anchor, the trigger is the screen's own button (so a long-press can
 * open the same panel): it carries `data-popover-toggle={toggleId}`, and a
 * tap on it is not taken as a tap outside, so it toggles rather than closing
 * and reopening.
 */
export function Popover({
  open,
  onOpenChange,
  anchor,
  trigger,
  children,
  label,
  toggleId,
  side = "top",
  align = "center",
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor?: ReactNode;
  trigger?: ReactNode;
  children: ReactNode;
  /** What the panel is, for a screen reader. */
  label: string;
  /** With an anchor: the id the screen's own toggle button carries as `data-popover-toggle`. */
  toggleId?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      {anchor ? <RadixPopover.Anchor asChild>{anchor}</RadixPopover.Anchor> : null}
      {/* With an anchor, the trigger is the screen's own button (it opens the panel itself); without one it is Radix's trigger and anchor both. */}
      {trigger ? anchor ? trigger : <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger> : null}
      <RadixPopover.Portal>
        <RadixPopover.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          onInteractOutside={(event) => {
            const target = event.target as Element | null;
            if (toggleId && target?.closest?.(`[data-popover-toggle="${toggleId}"]`)) event.preventDefault();
          }}
          className={cn(
            "z-50 max-w-[calc(100vw-2rem)] rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-1.5 shadow-[var(--wh-shadow-float)] outline-none",
            className,
          )}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
