"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";

import { sendPhoneCode, verifyPhoneCode, type PhoneSignInState } from "../../(auth)/actions";

export type PhoneSignInLabels = {
  number: string;
  numberHint: string;
  send: string;
  sending: string;
  code: string;
  verify: string;
  verifying: string;
  otherNumber: string;
  resend: string;
};

function Submit({ label, pending: pendingLabel, variant }: { label: string; pending: string; variant?: "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Signing in by phone (story 01-011): the number, then the code texted to it.
 * The number travels to the second step as a hidden field and is read again on
 * the server; the code is never kept anywhere.
 */
export function PhoneSignInForm({ next, labels }: { next: string; labels: PhoneSignInLabels }) {
  const [sent, send] = useActionState<PhoneSignInState, FormData>(sendPhoneCode, {});
  const [verified, verify] = useActionState<PhoneSignInState, FormData>(verifyPhoneCode, {});
  const phone = verified.phone ?? sent.phone;

  if (!phone || (sent.error && !verified.phone)) {
    return (
      <form action={send} className="space-y-4">
        {sent.error ? <Alert>{sent.error}</Alert> : null}
        <Field label={labels.number} name="phone" type="tel" inputMode="tel" autoComplete="tel" required hint={labels.numberHint} placeholder="98765 43210" />
        <Submit label={labels.send} pending={labels.sending} />
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <form action={verify} className="space-y-4">
        {verified.error ? <Alert>{verified.error}</Alert> : sent.notice ? <Alert tone="info">{sent.notice}</Alert> : null}
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="next" value={next} />
        <Field label={labels.code} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9 ]{4,12}" />
        <Submit label={labels.verify} pending={labels.verifying} />
      </form>
      <form action={send}>
        <input type="hidden" name="phone" value={phone} />
        <Submit label={labels.resend} pending={labels.sending} variant="secondary" />
      </form>
      <a href={`/sign-in/phone?next=${encodeURIComponent(next)}`} className="block text-center text-sm font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
        {labels.otherNumber}
      </a>
    </div>
  );
}
