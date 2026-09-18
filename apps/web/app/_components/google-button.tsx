"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";

import type { ActionState } from "../(auth)/actions";

/** Google's mark, inline so no request leaves for a third-party CDN. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-[18px]">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-11 w-full items-center justify-center gap-2.5 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-sm font-semibold transition-colors hover:bg-[var(--wh-surface-muted)] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
    >
      <GoogleMark />
      {pending ? "Taking you to Google…" : label}
    </button>
  );
}

/**
 * Continue with Google.
 *
 * Rendered only where the deployment has Google configured — see
 * `config/auth-providers.ts` for why that is a runtime answer rather than a
 * design decision. The action re-checks the same flag, because a button that
 * is merely not drawn is not a control anybody has to go through.
 */
export function GoogleButton({
  action,
  label,
  next,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  next?: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="next" value={next ?? "/"} />
      <Submit label={label} />
    </form>
  );
}

/** The "or" rule between Google and the email form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-[var(--wh-border)]" />
      <span className="text-xs font-medium text-[var(--wh-foreground-subtle)]">or</span>
      <span className="h-px flex-1 bg-[var(--wh-border)]" />
    </div>
  );
}
