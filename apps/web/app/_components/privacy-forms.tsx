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
  what,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  purpose: "export" | "deletion";
  /** What they are confirming, so nobody confirms an unnamed thing. */
  what: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="purpose" value={purpose} />
      <PasswordField
        label="Your password"
        name="password"
        autoComplete="current-password"
        required
        hint={`We ask again ${what}. Being signed in says who you are; this says it is you, now.`}
      />
      <Submit label="Confirm it is me" busy="Checking…" variant="secondary" />
    </form>
  );
}

export function ExportForm({ householdId, confirmed }: { householdId: string; confirmed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/households/${householdId}/privacy/export`, { method: "POST" });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "We could not prepare your copy just now.");
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
      setError(caught instanceof Error ? caught.message : "We could not prepare your copy just now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {error ? <Alert>{error}</Alert> : null}
      <Button type="button" onClick={() => void download()} disabled={!confirmed || busy} className="w-full">
        {busy ? "Preparing your copy…" : "Download my copy"}
      </Button>
      {!confirmed ? (
        <p className="text-xs text-[var(--wh-foreground-subtle)]">Confirm it is you above first.</p>
      ) : null}
    </div>
  );
}

export function DeletionForm({
  action,
  householdId,
  confirmed,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  confirmed: boolean;
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
        <span className="text-sm">
          I understand this starts a countdown, and that when it runs out my data is gone.
        </span>
      </label>

      <fieldset disabled={!confirmed || !sure}>
        <Submit label="Ask for my data to be deleted" busy="Recording…" variant="danger" />
      </fieldset>
      {!confirmed ? (
        <p className="text-xs text-[var(--wh-foreground-subtle)]">Confirm it is you above first.</p>
      ) : null}
    </form>
  );
}

export function CancelDeletionForm({
  action,
  householdId,
  requestId,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  householdId: string;
  requestId: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="requestId" value={requestId} />
      <CallItOff />
    </form>
  );
}

/** Its own component, because useFormStatus only reads the form above it. */
function CallItOff() {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone="primary" disabled={pending}>
      {pending ? "Calling it off…" : "Call it off"}
    </Pill>
  );
}
