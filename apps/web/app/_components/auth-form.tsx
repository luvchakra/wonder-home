"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import type { ActionState } from "../(auth)/actions";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export type AuthFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel: string;
  children: React.ReactNode;
};

/**
 * Shared shell for the credential and onboarding forms: one error region, one
 * submit control that reports its own pending state.
 */
export function AuthForm({ action, submitLabel, pendingLabel, children }: AuthFormProps) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {children}
      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}
