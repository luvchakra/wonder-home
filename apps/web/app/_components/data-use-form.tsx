"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { ContentClass, DataUsePolicy } from "@wonderhome/core/ai/privacy";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import type { ActionState } from "../(auth)/actions";

/**
 * What this household agrees to send a model provider (story 15-005).
 *
 * Every line is a real thing about a real family, so each one is named in
 * their words rather than as a data category. "Anything about your children"
 * is a decision a parent can make; "child PII" is not.
 *
 * Keys and tokens are not on the list, because they are not a choice. The
 * note at the bottom says so rather than leaving their absence to be noticed.
 */

/** The classes a household may choose to send, in the order they are offered. */
const OPTIONAL_CLASSES: readonly OptionalClass[] = ["child", "health", "financial", "location", "private_message"];

type OptionalClass = Exclude<ContentClass, "general" | "credential">;

/** The form's words in the viewer's language, built on the server (story 22-004). */
export type DataUseFormLabels = {
  allow: string;
  allowDetail: string;
  include: string;
  includeDetail: string;
  classes: Record<OptionalClass, { label: string; detail: string }>;
  retention: string;
  retentionDetail: string;
  footer: string;
  submit: string;
  saving: string;
};

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function DataUseForm({
  action,
  householdId,
  policy,
  labels,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  policy: DataUsePolicy;
  labels: DataUseFormLabels;
}) {
  const [state, formAction] = useActionState(action, {});
  const [sending, setSending] = useState(policy.allowProviderContent);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="allowProviderContent"
          value="on"
          defaultChecked={policy.allowProviderContent}
          onChange={(event) => setSending(event.currentTarget.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--wh-primary)]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{labels.allow}</span>
          <span className="block text-xs text-[var(--wh-foreground-muted)]">{labels.allowDetail}</span>
        </span>
      </label>

      <fieldset disabled={!sending} className="space-y-3 disabled:opacity-50">
        <legend className="text-sm font-medium">{labels.include}</legend>
        <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.includeDetail}</p>

        {OPTIONAL_CLASSES.map((value) => (
          <label key={value} className="flex items-start gap-3">
            <input
              type="checkbox"
              name="allowedClasses"
              value={value}
              defaultChecked={policy.allowedClasses.includes(value)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--wh-primary)]"
            />
            <span className="min-w-0">
              <span className="block text-sm">{labels.classes[value].label}</span>
              <span className="block text-xs text-[var(--wh-foreground-muted)]">{labels.classes[value].detail}</span>
            </span>
          </label>
        ))}

        {/* General is always on when the provider is on; a hidden field keeps
            it in the posted set, because the action takes what arrives as the
            whole truth rather than merging with what was there. */}
        <input type="hidden" name="allowedClasses" value="general" />

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="allowRetention"
            value="on"
            defaultChecked={policy.allowRetention}
            className="mt-0.5 size-5 shrink-0 accent-[var(--wh-primary)]"
          />
          <span className="min-w-0">
            <span className="block text-sm">{labels.retention}</span>
            <span className="block text-xs text-[var(--wh-foreground-muted)]">{labels.retentionDetail}</span>
          </span>
        </label>
      </fieldset>

      <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.footer}</p>

      <Submit label={labels.submit} pendingLabel={labels.saving} />
    </form>
  );
}
