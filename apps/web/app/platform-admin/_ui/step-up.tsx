"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { PasswordField } from "@wonderhome/core/ui/password-field";

import { signInWithGoogle } from "../../(auth)/actions";
import type { StaffStepUp } from "../../_lib/platform-step-up-rules";

const until = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

/**
 * For an account that signs in with Google alone: there is no password to
 * type, so "Confirm with Google" signs in again and comes back here; a save
 * in the next ten minutes counts as confirmed. Rendered outside the save form
 * (a form can't hold another).
 */
export function GoogleConfirm({ stepUp, next }: { stepUp: StaffStepUp; next: string }) {
  const [state, start, starting] = useActionState(signInWithGoogle, {});
  if (stepUp.method !== "google") return null;
  if (stepUp.freshUntil) {
    return <p className="text-xs text-[var(--wh-foreground-muted)]">Confirmed with Google. Save before {until(stepUp.freshUntil)} IST, or confirm again.</p>;
  }
  return (
    <form action={start} className="space-y-2">
      <input type="hidden" name="next" value={next} />
      <p className="text-xs text-[var(--wh-foreground-muted)]">You sign in with Google, so there&rsquo;s no password to type. Confirm it&rsquo;s you first; you then have ten minutes to save.</p>
      <Button type="submit" variant="secondary" disabled={starting}>{starting ? "Opening Google…" : "Confirm with Google"}</Button>
      {state && "error" in state && state.error ? <Alert tone="risk">{state.error}</Alert> : null}
    </form>
  );
}

/** The password half of the step-up, inside the save form; nothing for a Google-only account. */
export function StepUpPassword({ stepUp, name, id, label = "Your WonderHome password", error }: { stepUp: StaffStepUp; name: string; id?: string; label?: string; error?: string }) {
  if (stepUp.method !== "password") return null;
  return <PasswordField label={label} id={id} name={name} autoComplete="current-password" required hint="Changing a secret needs your WonderHome password again (not the key)." error={error} />;
}
