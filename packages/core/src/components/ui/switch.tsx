"use client";

import { Switch as RadixSwitch } from "radix-ui";

import { cn } from "../../lib/cn";

/**
 * An on/off control, for a setting rather than a choice among options
 * (`SegmentedControl` is for the latter).
 *
 * Radix underneath for the parts that are easy to get wrong — keyboard
 * toggling, the `aria-checked` state, a label that actually reaches the
 * control — the same reason the rest of the kit's interactive pieces
 * (`Sheet`, `ViewerMenu`) build on it rather than a styled checkbox.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Read by assistive technology; visible callers still show their own label beside it. */
  label: string;
  className?: string;
}) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--wh-primary)]" : "bg-[var(--wh-border-strong)]",
        className,
      )}
    >
      <RadixSwitch.Thumb
        className={cn(
          "block size-[1.125rem] translate-x-0.5 rounded-full bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)] transition-transform",
          checked && "translate-x-[1.125rem]",
        )}
      />
    </RadixSwitch.Root>
  );
}
