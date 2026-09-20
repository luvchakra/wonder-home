"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * A value on a scale, with the value itself always visible.
 *
 * A bare range input is a handle on a line: it tells a person that
 * something changed but never what it changed *to*, which is useless for
 * anything they would want to set exactly. The current value sits beside
 * the label, in the unit a household thinks in ("1.15×", "-2 semitones"),
 * and the ends of the scale are named underneath so the direction is
 * obvious before anything is dragged.
 */
export function Slider({
  label,
  name,
  value: initialValue,
  format,
  lowLabel,
  highLabel,
  hint,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "type"> & {
  label: string;
  name: string;
  value: number;
  /** The value as a household reads it, units and all. */
  format: (value: number) => string;
  lowLabel: string;
  highLabel: string;
  hint?: ReactNode;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={name} className="text-sm font-medium">
          {label}
        </label>
        <output htmlFor={name} className="text-sm font-semibold tabular-nums text-[var(--wh-primary)]">
          {format(value)}
        </output>
      </div>
      <input
        {...props}
        type="range"
        id={name}
        name={name}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className={cn(
          "block h-11 w-full cursor-pointer appearance-none bg-transparent",
          "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[var(--wh-border-strong)]",
          "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[var(--wh-border-strong)]",
          "[&::-webkit-slider-thumb]:-mt-[0.5625rem] [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--wh-primary)] [&::-webkit-slider-thumb]:shadow-[var(--wh-shadow-card)]",
          "[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--wh-primary)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
          className,
        )}
      />
      <div className="flex justify-between text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      {hint ? (
        <p id={`${name}-hint`} className="text-xs text-[var(--wh-foreground-subtle)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
