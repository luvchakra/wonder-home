"use client";

import { useActionState, type ReactNode } from "react";

import { Alert } from "@wonderhome/core/ui/alert";

import type { OnboardingActionState } from "../(auth)/onboarding-actions";

/**
 * Every setup form: one server action, one place its error shows, nothing
 * else. The screens stay server-rendered around it, so each step is the
 * household's real data at the moment it is shown.
 */
export function OnboardingForm({
  action,
  children,
  className,
}: {
  action: (state: OnboardingActionState, formData: FormData) => Promise<OnboardingActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {state.error ? <Alert className="mb-4">{state.error}</Alert> : null}
      {children}
    </form>
  );
}
