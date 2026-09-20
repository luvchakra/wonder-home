"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@wonderhome/core/ui/button";
import { Pill, type PillProps } from "@wonderhome/core/ui/pill";

/**
 * A submit that says when it is working. Every mutating form in the app gives
 * this feedback; these exist so the small inline ones (a row's "Done", a
 * member's admin toggle) do too, instead of a click that changes nothing for
 * a second and then everything at once.
 *
 * Spreads the rest of the button's own props through, so an icon-only call
 * site can still pass `aria-label` — a row's actions are icons with a real
 * accessible name (design principle 11), not full-width text, and this is
 * the one place that label has somewhere to go.
 */
export function SubmitPill({ children, pendingLabel = "…", tone = "quiet", className, ...rest }: Omit<PillProps, "type" | "disabled"> & { pendingLabel?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone={tone} disabled={pending} className={className} {...rest}>
      {pending ? pendingLabel : children}
    </Pill>
  );
}

export function SubmitButton({ children, pendingLabel = "Working…", ...props }: Omit<ButtonProps, "type"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
