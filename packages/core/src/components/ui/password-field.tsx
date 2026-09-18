"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/cn";

export type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  /** The link that sits beside the label, for "Forgot password?". */
  action?: ReactNode;
};

/**
 * A password input that can be read back.
 *
 * Typing a password you cannot see is how people mistype one and then cannot
 * tell why they were refused — worst of all on a phone keyboard. The toggle is
 * a real button: it is reachable by keyboard, it says which state it is in
 * rather than relying on the icon alone, and it never submits the form.
 *
 * The field starts hidden every time. Revealing is a deliberate act by the
 * person in front of the screen, and it is never remembered across a render,
 * because the next person to open the laptop is not necessarily them.
 */
export function PasswordField({
  label,
  name,
  hint,
  error,
  action,
  className,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();
  const errorId = useId();

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={name} className="block text-sm font-medium">
          {label}
        </label>
        {action}
      </div>

      <div className="relative">
        <input
          {...props}
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border bg-[var(--wh-surface)] py-2 pr-12 pl-3 text-base",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]",
            error ? "border-[var(--wh-risk)]" : "border-[var(--wh-border)]",
            className,
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-pressed={visible}
          aria-controls={name}
          // The icon alone would leave a screen reader guessing, and "show"
          // and "hide" are the two things worth announcing here.
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-[var(--wh-radius-sm)] text-[var(--wh-foreground-subtle)] transition-colors hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--wh-primary)]"
        >
          {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
        </button>
      </div>

      {hint ? (
        <p id={hintId} className="text-xs text-[var(--wh-foreground-subtle)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-[var(--wh-risk)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
