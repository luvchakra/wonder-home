import type { ReactNode, SelectHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

/**
 * A labelled choice among a fixed list.
 *
 * Deliberately the browser's own `select` rather than a styled menu: on a
 * phone that opens the operating system's picker, which is reachable,
 * scrollable with a thumb, and already familiar — everything a hand-built
 * dropdown has to re-earn, and usually does not at 360px. `Field` does the
 * same for text, and this matches it line for line so a form built from
 * both reads as one thing.
 */
export function Select({
  label,
  name,
  hint,
  error,
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(" ");

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <select
        {...props}
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border bg-[var(--wh-surface)] px-3 text-base",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]",
          error ? "border-[var(--wh-risk)]" : "border-[var(--wh-border)]",
          className,
        )}
      >
        {children}
      </select>
      {hint ? (
        <p id={`${name}-hint`} className="text-xs text-[var(--wh-foreground-subtle)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${name}-error`} className="text-xs text-[var(--wh-risk)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
