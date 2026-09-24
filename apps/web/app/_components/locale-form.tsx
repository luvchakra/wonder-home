"use client";

import { useActionState, type ReactNode } from "react";

import { Alert } from "@wonderhome/core/ui/alert";

import type { LocaleActionState } from "../(auth)/locale-actions";

/** Every language/region form: one action, one place its error or confirmation shows. */
export function LocaleForm({
  action,
  children,
  className,
}: {
  action: (state: LocaleActionState, formData: FormData) => Promise<LocaleActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {state.error ? <Alert className="mb-4">{state.error}</Alert> : null}
      {state.notice ? (
        <Alert tone="info" className="mb-4">
          {state.notice}
        </Alert>
      ) : null}
      {children}
    </form>
  );
}
