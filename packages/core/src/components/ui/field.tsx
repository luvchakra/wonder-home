import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  /** Shown beneath the control and announced with it. */
  hint?: ReactNode;
  error?: string;
};

/**
 * A labelled input. The label is always real — never a placeholder standing in
 * for one — and errors are wired through aria-describedby so a screen reader
 * hears why the field was rejected.
 */
export function Field({ label, name, hint, error, className, ...props }: FieldProps) {
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
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
      />
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
