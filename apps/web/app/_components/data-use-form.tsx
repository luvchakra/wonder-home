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

const OPTIONAL_CLASSES: { value: Exclude<ContentClass, "general" | "credential">; label: string; detail: string }[] = [
  { value: "child", label: "Anything about your children", detail: "School, activities, how they are getting on." },
  { value: "health", label: "Health", detail: "Appointments, medication, conditions." },
  { value: "financial", label: "Amounts and bills", detail: "What things cost and what is owed." },
  { value: "location", label: "Where people are", detail: "Who is where, and when they will be back." },
  { value: "private_message", label: "What people wrote to each other", detail: "Messages between members of the household." },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : "Save what you agree to"}
    </Button>
  );
}

export function DataUseForm({
  action,
  householdId,
  policy,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  policy: DataUsePolicy;
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
          <span className="block text-sm font-medium">Let the assistant ask a model provider</span>
          <span className="block text-xs text-[var(--wh-foreground-muted)]">
            Turn this off and nothing about your home leaves. The assistant still works from its own rules.
          </span>
        </span>
      </label>

      <fieldset disabled={!sending} className="space-y-3 disabled:opacity-50">
        <legend className="text-sm font-medium">What it may include</legend>
        <p className="text-xs text-[var(--wh-foreground-muted)]">
          Ordinary household matters — what is on today, who does what, the lists — are always included when
          the assistant asks. These are the ones it only sends if you say so.
        </p>

        {OPTIONAL_CLASSES.map((entry) => (
          <label key={entry.value} className="flex items-start gap-3">
            <input
              type="checkbox"
              name="allowedClasses"
              value={entry.value}
              defaultChecked={policy.allowedClasses.includes(entry.value)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--wh-primary)]"
            />
            <span className="min-w-0">
              <span className="block text-sm">{entry.label}</span>
              <span className="block text-xs text-[var(--wh-foreground-muted)]">{entry.detail}</span>
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
            <span className="block text-sm">The provider may keep what is sent</span>
            <span className="block text-xs text-[var(--wh-foreground-muted)]">
              Off by default. On, it is kept under their terms rather than ours.
            </span>
          </span>
        </label>
      </fieldset>

      <p className="text-xs text-[var(--wh-foreground-subtle)]">
        Keys and tokens are never sent, and that is not a setting. Names are replaced with roles before
        anything leaves, so a provider sees “Child A”, never your child.
      </p>

      <Submit />
    </form>
  );
}
