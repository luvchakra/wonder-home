"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode, TextareaHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

/** Past this share of `maxLength` the counter appears; before it the field stays quiet. */
export const COUNTER_FROM = 0.9;

/** True when the browser sizes a textarea to its content by itself (CSS `field-sizing`). */
export function supportsFieldSizing(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");
}

/** Sets the element's height to its content. The CSS max-height still caps it, so a very long note scrolls. */
export function fitToContent(element: HTMLTextAreaElement): void {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

/**
 * Fallback for browsers without `field-sizing: content`: grows the textarea as text is typed or
 * loaded. A no-op where the browser does it natively. Returns a ref and an `onInput` handler.
 */
export function useAutoGrow<T extends HTMLTextAreaElement>(value?: string) {
  const ref = useRef<T | null>(null);
  const native = useRef<boolean | null>(null);
  const fit = useCallback(() => {
    native.current ??= supportsFieldSizing();
    if (!native.current && ref.current) fitToContent(ref.current);
  }, []);
  useEffect(fit, [fit, value]);
  return { ref, onInput: fit };
}

export type TextareaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  /** Rows shown when empty. Defaults to 2 so the form stays compact. */
  minRows?: number;
};

/**
 * A labelled multi-line field that grows with its content (up to 40vh, then it scrolls) so a long
 * note is never cut off and Save stays on screen. Same border, radius, padding and focus as `Field`.
 * Newlines are kept as typed. With a `maxLength`, a gentle counter shows once the text nears it.
 */
export function TextareaField({
  label,
  name,
  hint,
  error,
  minRows = 2,
  className,
  maxLength,
  onChange,
  value,
  defaultValue,
  ...props
}: TextareaFieldProps) {
  const controlled = value !== undefined;
  const [typed, setTyped] = useState(String(defaultValue ?? ""));
  const current = controlled ? String(value) : typed;
  const { ref, onInput } = useAutoGrow<HTMLTextAreaElement>(current);

  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(" ");
  const showCounter = maxLength !== undefined && current.length >= maxLength * COUNTER_FROM;

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        {...props}
        ref={ref}
        id={name}
        name={name}
        rows={minRows}
        maxLength={maxLength}
        {...(controlled ? { value } : { defaultValue })}
        onInput={onInput}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
          if (!controlled) setTyped(event.target.value);
          onChange?.(event);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          "block w-full max-h-[40vh] resize-none overflow-y-auto field-sizing-content whitespace-pre-wrap rounded-[var(--wh-radius-sm)] border bg-[var(--wh-surface)] px-3 py-2 text-base",
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
      {showCounter ? (
        <p className="text-xs text-[var(--wh-foreground-subtle)]" aria-live="polite">
          {current.length} / {maxLength}
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
