"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * A small whole number chosen with − and + — "how many children?" — for a
 * count too small to deserve a keyboard (mockup: onboarding, Family basics).
 *
 * The value is a real form field (a hidden input), so the form posts it
 * without script; the buttons only move it within `min`..`max`. Each button
 * says what it does in words ("Fewer children"), and the number is announced
 * as it changes, so the control reads the same without sight of it.
 */
export function Stepper({
  label,
  name,
  min = 0,
  max = 12,
  defaultValue = 0,
  icon,
  noun,
  className,
}: {
  label: string;
  name: string;
  min?: number;
  max?: number;
  defaultValue?: number;
  /** The row's tinted tile. */
  icon?: ReactNode;
  /** The plural for the button labels: "children" → "Fewer children". Defaults to the label, lowercased. */
  noun?: string;
  className?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(() => Math.min(max, Math.max(min, defaultValue)));
  const things = noun ?? label.toLowerCase();

  return (
    <div className={cn("flex items-center gap-3 py-2", className)}>
      {icon}
      <span id={id} className="min-w-0 flex-1 text-[0.9375rem] font-medium">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={`Fewer ${things}`}
          disabled={value <= min}
          onClick={() => setValue((current) => Math.max(min, current - 1))}
          className="grid size-10 place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <output aria-live="polite" className="w-7 text-center text-base font-semibold tabular-nums">
          {value}
        </output>
        <button
          type="button"
          aria-label={`More ${things}`}
          disabled={value >= max}
          onClick={() => setValue((current) => Math.min(max, current + 1))}
          className="grid size-10 place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-primary)] transition-colors hover:bg-[var(--wh-primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
