"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { PasswordField } from "@wonderhome/core/ui/password-field";
import { Pill } from "@wonderhome/core/ui/pill";

import type { ActionState } from "../(auth)/actions";

/**
 * Confirming it is you, and the two things that unlocks (story 15-007).
 *
 * The password and the irreversible thing are two separate submits on purpose.
 * A single form that took a password and deleted in the same click would make
 * the password the decision; here a person confirms, sees that it worked, and
 * then chooses — with the choice still in front of them and still refusable.
 */

/** The Privacy Centre forms' words in the viewer's language, built on the server (story 22-004). */
export type ConfirmItIsYouLabels = {
  password: string;
  /** Names what is being confirmed, so nobody confirms an unnamed thing. */
  hint: string;
  submit: string;
  checking: string;
};
export type ExportFormLabels = { error: string; preparing: string; download: string; confirmFirst: string };
export type DeletionFormLabels = { understand: string; submit: string; recording: string; confirmFirst: string };
export type CancelDeletionLabels = { callOff: string; callingOff: string };

function Submit({ label, busy, variant }: { label: string; busy: string; variant?: "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      variant={variant === "danger" ? "secondary" : variant}
      className={variant === "danger" ? "w-full border-[var(--wh-risk)] text-[var(--wh-risk)]" : "w-full"}
    >
      {pending ? busy : label}
    </Button>
  );
}

export function ConfirmItIsYouForm({
  action,
  householdId,
  purpose,
  labels,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  purpose: "export" | "deletion";
  labels: ConfirmItIsYouLabels;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="purpose" value={purpose} />
      <PasswordField
        label={labels.password}
        name="password"
        autoComplete="current-password"
        required
        hint={labels.hint}
      />
      <Submit label={labels.submit} busy={labels.checking} variant="secondary" />
    </form>
  );
}

export function ExportForm({ householdId, confirmed, labels }: { householdId: string; confirmed: boolean; labels: ExportFormLabels }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/households/${householdId}/privacy/export`, { method: "POST" });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? labels.error);
      }

      // The file only ever exists in this reply. Nothing is stored, so there is
      // no link to leak and nothing to expire.
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "wonderhome-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {error ? <Alert>{error}</Alert> : null}
      <Button type="button" onClick={() => void download()} disabled={!confirmed || busy} className="w-full">
        {busy ? labels.preparing : labels.download}
      </Button>
      {!confirmed ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.confirmFirst}</p> : null}
    </div>
  );
}

export function DeletionForm({
  action,
  householdId,
  confirmed,
  labels,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  confirmed: boolean;
  labels: DeletionFormLabels;
}) {
  const [state, formAction] = useActionState(action, {});
  const [sure, setSure] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={sure}
          onChange={(event) => setSure(event.currentTarget.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--wh-risk)]"
        />
        <span className="text-sm">{labels.understand}</span>
      </label>

      <fieldset disabled={!confirmed || !sure}>
        <Submit label={labels.submit} busy={labels.recording} variant="danger" />
      </fieldset>
      {!confirmed ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.confirmFirst}</p> : null}
    </form>
  );
}

export function CancelDeletionForm({
  action,
  householdId,
  requestId,
  labels,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  requestId: string;
  labels: CancelDeletionLabels;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="requestId" value={requestId} />
      <CallItOff labels={labels} />
    </form>
  );
}

/** Its own component, because useFormStatus only reads the form above it. */
function CallItOff({ labels }: { labels: CancelDeletionLabels }) {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone="primary" disabled={pending}>
      {pending ? labels.callingOff : labels.callOff}
    </Pill>
  );
}
