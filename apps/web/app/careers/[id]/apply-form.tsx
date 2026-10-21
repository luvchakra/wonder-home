"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { startTransition, useActionState, useRef } from "react";

import { APPLICATION_LIMITS, type ApplicationField } from "@wonderhome/core/careers/application";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";

import { applyAction, type ApplyState } from "../actions";

const LABEL = "block text-sm font-medium";
const BOX = "block w-full rounded-[var(--wh-radius-sm)] border bg-[var(--wh-surface)] px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]";

/**
 * The application, sent through this app's own server (never straight to
 * WonderJobs). "Application sent" shows only after WonderJobs answered 200.
 * Submitted by hand, so a refusal keeps what was typed.
 */
export function ApplyForm({ jobId, consent }: { jobId: string; consent: string }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyAction, { status: "idle" });
  const form = useRef<HTMLFormElement>(null);

  if (state.status === "sent") {
    return (
      <div role="status" className="flex gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-handled-soft)] p-4 text-sm text-[var(--wh-foreground)]">
        <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-handled)]" />
        <p>Application sent. Check your email for a confirmation and a link to follow it.</p>
      </div>
    );
  }
  if (state.status === "closed") {
    return (
      <div role="status" className="space-y-2 text-sm">
        <p className="font-semibold">This position is no longer open</p>
        <Link href="/careers" className="font-medium text-[var(--wh-primary)] hover:underline">See the open positions</Link>
      </div>
    );
  }

  const errorFor = (field: ApplicationField) => (state.status === "error" && state.field === field ? state.message : undefined);
  const general = state.status === "error" && !state.field ? state.message : null;

  return (
    <form
      ref={form}
      noValidate
      className="space-y-4"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      {/* Hidden from people and from screen readers; a bot fills it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="name" required maxLength={APPLICATION_LIMITS.name} autoComplete="name" error={errorFor("name")} />
        <Field label="Email" name="email" type="email" required maxLength={APPLICATION_LIMITS.email} autoComplete="email" error={errorFor("email")} />
        <Field label="Phone (optional)" name="phone" type="tel" maxLength={APPLICATION_LIMITS.phone} autoComplete="tel" error={errorFor("phone")} />
        <Field label="Location (optional)" name="location" maxLength={APPLICATION_LIMITS.location} autoComplete="address-level2" placeholder="City, country" error={errorFor("location")} />
      </div>
      <Field
        label="Résumé link"
        name="resumeUrl"
        type="url"
        required
        maxLength={APPLICATION_LIMITS.resumeUrl}
        placeholder="https://"
        hint="A link anyone with it can open: Google Drive, Dropbox, LinkedIn or your own site."
        error={errorFor("resumeUrl")}
      />
      <Field label="LinkedIn or portfolio (optional)" name="linkedinUrl" type="url" maxLength={APPLICATION_LIMITS.linkedinUrl} placeholder="https://" error={errorFor("linkedinUrl")} />

      <div className="space-y-1.5">
        <label htmlFor="coverNote" className={LABEL}>Cover note (optional)</label>
        <textarea
          id="coverNote"
          name="coverNote"
          rows={5}
          maxLength={APPLICATION_LIMITS.coverNote}
          aria-invalid={errorFor("coverNote") ? true : undefined}
          aria-describedby={["coverNote-hint", errorFor("coverNote") ? "coverNote-error" : null].filter(Boolean).join(" ")}
          className={`${BOX} ${errorFor("coverNote") ? "border-[var(--wh-risk)]" : "border-[var(--wh-border)]"}`}
        />
        <p id="coverNote-hint" className="text-xs text-[var(--wh-foreground-muted)]">Up to {APPLICATION_LIMITS.coverNote.toLocaleString("en")} characters.</p>
        {errorFor("coverNote") ? <p id="coverNote-error" className="text-sm text-[var(--wh-risk)]">{errorFor("coverNote")}</p> : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-start gap-3">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            required
            aria-invalid={errorFor("consent") ? true : undefined}
            aria-describedby={errorFor("consent") ? "consent-error" : undefined}
            className="mt-0.5 size-5 shrink-0 accent-[var(--wh-primary)]"
          />
          <label htmlFor="consent" className="text-sm">{consent}</label>
        </div>
        {errorFor("consent") ? <p id="consent-error" className="text-sm text-[var(--wh-risk)]">{errorFor("consent")}</p> : null}
      </div>

      {general ? <Alert>{general}</Alert> : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending…" : "Send application"}
      </Button>
    </form>
  );
}
