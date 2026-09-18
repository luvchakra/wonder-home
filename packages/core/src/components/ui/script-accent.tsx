import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * The handwritten line.
 *
 * Every approved mockup sheet carries one: "Less mental load. More family
 * time." on the splash, "A brighter tomorrow starts at home." beside the sign
 * up form, "Home runs smoother. Together." closing the landing page. It is the
 * one place WonderHome speaks in its own hand rather than its interface voice,
 * and it is what stops a calm product from reading as a clinical one.
 *
 * Three rules keep it from becoming noise:
 *
 * 1. **It is decoration, never information.** Nothing a household needs to
 *    know is ever said only in script — the accent is marked as decorative for
 *    assistive technology, and every screen reads correctly without it.
 * 2. **One per screen.** A second handwritten line halves the effect of the
 *    first and starts to look like a greetings card.
 * 3. **It is never a control.** No link, no button, nothing tappable, because
 *    a handwritten label gives no affordance that it can be pressed.
 */
export type ScriptAccentProps = {
  children: ReactNode;
  /** The warm brand tones the mockups use for it. */
  tone?: "primary" | "people" | "muted";
  size?: "sm" | "md" | "lg";
  /** The gentle tilt the mockups give it. Off for a line inside a tight row. */
  tilt?: boolean;
  /** The small heart that closes the line on the splash and the landing page. */
  heart?: boolean;
  className?: string;
};

const TONES = {
  primary: "text-[var(--wh-primary)]",
  people: "text-[var(--wh-tone-people)]",
  muted: "text-[var(--wh-foreground-muted)]",
} as const;

const SIZES = {
  sm: "text-[1.375rem] leading-[1.25]",
  md: "text-[1.75rem] leading-[1.2]",
  lg: "text-[clamp(2rem,1.4rem+2vw,3rem)] leading-[1.15]",
} as const;

export function ScriptAccent({
  children,
  tone = "primary",
  size = "md",
  tilt = true,
  heart = false,
  className,
}: ScriptAccentProps) {
  return (
    <p
      aria-hidden
      className={cn(
        "font-[family-name:var(--wh-font-script)] font-medium text-balance select-none",
        TONES[tone],
        SIZES[size],
        tilt && "-rotate-[2.5deg]",
        className,
      )}
    >
      {children}
      {heart ? <span className="ml-1.5 text-[0.8em] text-[var(--wh-tone-people)]">♥</span> : null}
    </p>
  );
}
