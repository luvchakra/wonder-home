"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { PasswordField } from "@wonderhome/core/ui/password-field";

import { signInWithGoogle } from "../../(auth)/actions";
import type { StaffStepUp } from "../../_lib/platform-step-up-rules";
import type { ResetErrorCode, ResetState } from "./reset-state";

/**
 * Reset home's client pieces (story 15-014): the full download, the note on
 * whether one was made in this browser session, and the confirm form.
 *
 * The destructive button is the kit's secondary button in the risk colour (the
 * kit has no destructive variant; this is the pattern the Privacy Centre's
 * delete uses), never the blue commit style, and it says what it does.
 */

export type StepUpLabels = {
  password: string;
  passwordHint: string;
  googleBody: string;
  googleButton: string;
  googleOpening: string;
  googleFresh: string;
};

export type DownloadLabels = StepUpLabels & {
  button: string;
  preparing: string;
  done: string;
  error: string;
  healthLede: string;
  healthPassword: string;
  healthRepeat: string;
  healthHint: string;
  healthTooShort: string;
  healthTooLong: string;
  healthMismatch: string;
};

/** The same rule the server applies (`healthPasswordProblem`); kept here so the client bundle needs no server module. */
const HEALTH_MIN = 12;
const HEALTH_MAX = 200;

export type ResetLabels = StepUpLabels & {
  name: string;
  nameHint: string;
  submit: string;
  submitting: string;
  errors: Record<ResetErrorCode, string>;
};

export type DownloadedLabels = { yes: string; no: string };

const storageKey = (householdId: string) => `wh.fullDownload.${householdId}`;
const DOWNLOADED_EVENT = "wh-full-download";

function timeOf(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleTimeString(language, { hour: "numeric", minute: "2-digit" });
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
}

/** For an account that signs in with Google alone: sign in again, then ten minutes to act. Its own form (forms can't nest). */
export function GoogleConfirm({ stepUp, next, labels, language }: { stepUp: StaffStepUp; next: string; labels: StepUpLabels; language: string }) {
  const [state, start, starting] = useActionState(signInWithGoogle, {});
  if (stepUp.method !== "google") return null;
  if (stepUp.freshUntil) {
    return <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.googleFresh.replace("{time}", timeOf(stepUp.freshUntil, language))}</p>;
  }
  return (
    <form action={start} className="space-y-2">
      <input type="hidden" name="next" value={next} />
      <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.googleBody}</p>
      <Button type="submit" variant="secondary" disabled={starting}>
        {starting ? labels.googleOpening : labels.googleButton}
      </Button>
      {state && "error" in state && state.error ? <Alert tone="risk">{state.error}</Alert> : null}
    </form>
  );
}

export function DownloadFullData({
  householdId,
  stepUp,
  next,
  labels,
  language,
  googleConfirmHere = true,
  askHealthPassword,
}: {
  householdId: string;
  stepUp: StaffStepUp;
  next: string;
  labels: DownloadLabels;
  language: string;
  /** False where the page already shows its one "Confirm with Google" (rule 14: no two buttons for one job). */
  googleConfirmHere?: boolean;
  /** True when the owner can see health records: they are then locked with a password typed here. */
  askHealthPassword: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<string | null>(null);
  // Each field its own id: two forms on one page both have a "password" field, and a label must find its own.
  const idBase = useId();
  const [password, setPassword] = useState("");
  const [healthPassword, setHealthPassword] = useState("");
  const [healthRepeat, setHealthRepeat] = useState("");
  const blocked = stepUp.method === "google" && !stepUp.freshUntil;

  const download = async () => {
    setError(null);
    if (askHealthPassword) {
      if (healthPassword.length < HEALTH_MIN) return setError(labels.healthTooShort);
      if (healthPassword.length > HEALTH_MAX) return setError(labels.healthTooLong);
      if (healthPassword !== healthRepeat) return setError(labels.healthMismatch);
    }
    setBusy(true);
    // The passwords go in this one request body and nowhere else; the fields
    // are emptied as soon as it starts, and nothing is kept in the browser.
    const body = JSON.stringify({
      ...(stepUp.method === "password" ? { password } : {}),
      ...(askHealthPassword ? { healthPassword, healthPasswordRepeat: healthRepeat } : {}),
    });
    setPassword("");
    setHealthPassword("");
    setHealthRepeat("");
    try {
      const response = await fetch(`/api/v1/households/${householdId}/export/full`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? labels.error);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "wonderhome.zip";
      link.click();
      URL.revokeObjectURL(url);
      const at = new Date().toISOString();
      try {
        sessionStorage.setItem(storageKey(householdId), at);
      } catch {
        // A private window may refuse storage; the note just says no download.
      }
      window.dispatchEvent(new Event(DOWNLOADED_EVENT));
      setDoneAt(at);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {googleConfirmHere ? <GoogleConfirm stepUp={stepUp} next={next} labels={labels} language={language} /> : null}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void download();
        }}
      >
        {stepUp.method === "password" ? (
          <PasswordField
            label={labels.password}
            name="password"
            id={`${idBase}-password`}
            autoComplete="current-password"
            required
            hint={labels.passwordHint}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
        ) : null}
        {askHealthPassword ? (
          <fieldset className="space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
            <p className="text-sm">{labels.healthLede}</p>
            <PasswordField
              label={labels.healthPassword}
              name="healthPassword"
              id={`${idBase}-health-password`}
              autoComplete="new-password"
              required
              maxLength={HEALTH_MAX}
              hint={labels.healthHint}
              value={healthPassword}
              onChange={(event) => setHealthPassword(event.currentTarget.value)}
            />
            <PasswordField
              label={labels.healthRepeat}
              name="healthPasswordRepeat"
              id={`${idBase}-health-repeat`}
              autoComplete="new-password"
              required
              maxLength={HEALTH_MAX}
              value={healthRepeat}
              onChange={(event) => setHealthRepeat(event.currentTarget.value)}
            />
          </fieldset>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
        {doneAt ? <Alert tone="info">{labels.done.replace("{time}", timeOf(doneAt, language))}</Alert> : null}
        <Button type="submit" variant="secondary" disabled={busy || blocked} className="w-full">
          {busy ? labels.preparing : labels.button}
        </Button>
      </form>
    </div>
  );
}

/** Whether a copy was downloaded in this browser session: the reset screen says so either way. */
export function DownloadedNote({ householdId, labels, language }: { householdId: string; labels: DownloadedLabels; language: string }) {
  const [at, setAt] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setAt(sessionStorage.getItem(storageKey(householdId)));
      } catch {
        setAt(null);
      }
    };
    read();
    window.addEventListener(DOWNLOADED_EVENT, read);
    return () => window.removeEventListener(DOWNLOADED_EVENT, read);
  }, [householdId]);
  return (
    <p data-testid="download-note" className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm">
      {at ? labels.yes.replace("{time}", timeOf(at, language)) : labels.no}
    </p>
  );
}

function ResetButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending} className="w-full border-[var(--wh-risk)] font-semibold text-[var(--wh-risk)]">
      {pending ? busy : label}
    </Button>
  );
}

export function ResetHomeForm({
  action,
  householdId,
  householdName,
  stepUp,
  labels,
}: {
  action: (state: ResetState, formData: FormData) => Promise<ResetState>;
  householdId: string;
  householdName: string;
  stepUp: StaffStepUp;
  labels: ResetLabels;
}) {
  const [state, formAction] = useActionState(action, {});
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === householdName.trim().toLowerCase() && typed.trim().length > 0;
  const blocked = stepUp.method === "google" && !stepUp.freshUntil;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="householdId" value={householdId} />
      <Field
        label={labels.name}
        name="confirmName"
        autoComplete="off"
        spellCheck={false}
        required
        hint={labels.nameHint}
        value={typed}
        onChange={(event) => setTyped(event.currentTarget.value)}
      />
      {stepUp.method === "password" ? (
        <PasswordField label={labels.password} name="password" id="reset-home-password" autoComplete="current-password" required hint={labels.passwordHint} />
      ) : null}
      {state.code ? <Alert tone="risk">{labels.errors[state.code]}</Alert> : null}
      <fieldset disabled={!matches || blocked}>
        <ResetButton label={labels.submit} busy={labels.submitting} />
      </fieldset>
    </form>
  );
}
