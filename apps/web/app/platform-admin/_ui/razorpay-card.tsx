"use client";

import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Badge } from "@wonderhome/core/ui/pill";

import type { RazorpayCardView } from "../../_lib/platform-settings-view";
import type { StaffStepUp } from "../../_lib/platform-step-up-rules";
import { saveRazorpayAction, type RazorpayActionState } from "../razorpay-actions";
import { GoogleConfirm, StepUpPassword } from "./step-up";

const IDLE: RazorpayActionState = { tone: null, message: null, field: null };
const NEXT = "/platform-admin/integrations#razorpay";

/**
 * Razorpay's one editor (rule 23; owner, 2026-11-20): the key id and the key
 * secret are pasted together and saved with one Save. What Razorpay calls
 * them is said beside each box, so its dashboard maps onto ours.
 */
export function RazorpayCard({ view, stepUp }: { view: RazorpayCardView; stepUp: StaffStepUp }) {
  const [state, save, saving] = useActionState(saveRazorpayAction, IDLE);
  const [copied, setCopied] = useState(false);
  const ready = Boolean(view.keyId) && view.secretSource !== "unset";
  const error = (field: RazorpayActionState["field"]) => (state.tone === "risk" && state.field === field ? (state.message ?? undefined) : undefined);
  const generalError = state.tone === "risk" && !state.field ? state.message : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(view.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section id="razorpay" aria-labelledby="razorpay-title" className="mb-4 scroll-mt-20 space-y-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="razorpay-title" className="text-sm font-semibold">Razorpay</h3>
        <Badge tone={ready ? "handled" : "attention"}>{ready ? "Keys in" : "Keys needed"}</Badge>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
        <dt className="text-[var(--wh-foreground-muted)]">Razorpay key id</dt>
        <dd className="font-mono break-all">{view.keyId ?? <span className="font-sans text-[var(--wh-foreground-muted)]">Not set</span>}</dd>
        <dt className="text-[var(--wh-foreground-muted)]">Razorpay key secret</dt>
        <dd>{view.secretSource === "unset" ? <span className="text-[var(--wh-foreground-muted)]">Not set</span> : view.secretLast4 ? `Saved · ends in ${view.secretLast4}` : "Saved"}</dd>
        <dt className="text-[var(--wh-foreground-muted)]">Payment provider</dt>
        <dd>
          {view.switchedOn ? "Switched on" : "Switched off"}
          {" · "}
          <a href="#setting-WONDERHOME_BILLING_PROVIDERS" className="font-medium text-[var(--wh-primary)] hover:underline">
            {view.switchedOn ? "Payment providers" : "Switch on in Payment providers"}
          </a>
        </dd>
        <dt className="text-[var(--wh-foreground-muted)]">Webhook URL</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <code className="text-xs break-all select-all">{view.webhookUrl}</code>
          <Button type="button" variant="quiet" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
        </dd>
        <dt className="text-[var(--wh-foreground-muted)]">Webhook secret</dt>
        <dd>
          {view.webhookSecretSource === "saved"
            ? `Saved here${view.webhookSecretLast4 ? `, ending in ${view.webhookSecretLast4}` : ""}`
            : view.webhookSecretSource === "environment"
              ? "Using Vercel's value — save it in the row below to manage it"
              : "Not set — enter it in the row below; Razorpay stays off until it is"}
        </dd>
      </dl>

      {view.canEdit ? (
        <div className="space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
          <GoogleConfirm stepUp={stepUp} next={NEXT} />
          <form action={save} className="space-y-3" autoComplete="off">
            <Field
              label="Razorpay key id"
              name="razorpay_key_id"
              defaultValue={view.keyId ?? undefined}
              spellCheck={false}
              autoComplete="off"
              hint="Razorpay's “Key Id” (“Test API Key” in test mode): starts with rzp_test_ or rzp_live_."
              error={error("keyId")}
            />
            <Field
              label="Razorpay key secret"
              name="razorpay_key_secret"
              type="password"
              spellCheck={false}
              autoComplete="new-password"
              placeholder={view.secretLast4 ? `Saved · ends in ${view.secretLast4}. Paste to replace.` : undefined}
              hint="Razorpay's “Key Secret” (“Test Key Secret”): 24 letters and numbers. Leave empty to keep the saved one. Stored encrypted; only its last four are shown."
              error={error("keySecret")}
            />
            <StepUpPassword stepUp={stepUp} name="razorpay_password" error={error("password")} />
            {stepUp.method === "password" ? null : error("password") ? <Alert tone="risk">{error("password")}</Alert> : null}
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </form>
        </div>
      ) : (
        <p className="text-xs text-[var(--wh-foreground-subtle)]">Only the owner can change the Razorpay keys.</p>
      )}

      <div aria-live="polite" className="space-y-2">
        {state.tone === "info" && state.message ? <Alert tone="info">{state.message}</Alert> : null}
        {generalError ? <Alert tone="risk">{generalError}</Alert> : null}
      </div>
    </section>
  );
}
