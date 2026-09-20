"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@wonderhome/core/ui/button";
import { Pill, type PillTone } from "@wonderhome/core/ui/pill";

/**
 * A submit that says when it is working. Every mutating form in the app gives
 * this feedback; these exist so the small inline ones (a row's "Done", a
 * member's "Make admin") do too, instead of a click that changes nothing for
 * a second and then everything at once.
 */
export function SubmitPill({ children, pendingLabel = "…", tone = "quiet", className }: { children: React.ReactNode; pendingLabel?: string; tone?: PillTone; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone={tone} disabled={pending} className={className}>
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
