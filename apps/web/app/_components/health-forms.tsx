"use client";

import { Plus, UserX } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import type { HealthConsent } from "@wonderhome/core/health/repository";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";
import { Switch } from "@wonderhome/core/ui/switch";

import type { ActionState } from "../(auth)/actions";
import { withName, type HealthFormLabels } from "../_lib/health-form-labels";
import {
  grantHealthConsentAction,
  revokeHealthConsentAction,
  setHealthAiAssistanceAction,
  setHealthPrivacyScopeAction,
} from "../(auth)/health-actions";

/** The stored values, in the order they are offered; their words come from `labels` (story 22-004). */
const SCOPES = ["private", "selected_family", "household_operational"] as const;

/** The privacy-scope choice itself — submits the moment a new option is picked. */
export function PrivacyScopeForm({
  householdId,
  memberId,
  currentScope,
  labels,
}: {
  householdId: string;
  memberId: string;
  currentScope: (typeof SCOPES)[number];
  labels: HealthFormLabels;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(setHealthPrivacyScopeAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3"
      onChange={() => formRef.current?.requestSubmit()}
    >
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="memberId" value={memberId} />
      <Select label={labels.privacy.label} name="privacyScope" defaultValue={currentScope}>
        {SCOPES.map((scope) => (
          <option key={scope} value={scope}>
            {labels.scopes[scope]}
          </option>
        ))}
      </Select>
      <p className="text-xs text-[var(--wh-foreground-subtle)]">
        {labels.privacy.hints[currentScope]}
      </p>
    </form>
  );
}

/** Whether HomeBrain may use this member's health data when it reasons about the household. */
export function HealthAiAssistanceToggle({
  householdId,
  memberId,
  enabled,
  labels,
}: {
  householdId: string;
  memberId: string;
  enabled: boolean;
  labels: HealthFormLabels;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setHealthAiAssistanceAction, {});
  const [checked, setChecked] = useState(enabled);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-2">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <form
        ref={formRef}
        action={formAction}
        className="flex items-center justify-between gap-3"
      >
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="memberId" value={memberId} />
        <input type="hidden" name="aiAssistanceEnabled" value={checked ? "true" : "false"} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{labels.privacy.aiTitle}</p>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.privacy.aiBody}</p>
        </div>
        <Switch
          checked={checked}
          disabled={pending}
          onCheckedChange={(next) => {
            setChecked(next);
            requestAnimationFrame(() => formRef.current?.requestSubmit());
          }}
          label={labels.privacy.aiSwitch}
        />
      </form>
    </div>
  );
}

/** Sharing this member's health data with someone else in the household — the "add" half of the sharing list. */
export function GrantHealthConsentButton({
  householdId,
  subjectMemberId,
  candidates,
  labels,
}: {
  householdId: string;
  subjectMemberId: string;
  candidates: { id: string; displayName: string }[];
  labels: HealthFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(grantHealthConsentAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) setOpen(false);
  }, [pending, state.error]);

  if (candidates.length === 0) return null;

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {labels.privacy.shareAdd}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={labels.privacy.shareTitle} description={labels.privacy.shareDescription}>
        <form
          action={(formData) => {
            submitted.current = true;
            formAction(formData);
          }}
          className="space-y-3"
        >
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="subjectMemberId" value={subjectMemberId} />
          <Select label={labels.privacy.shareWith} name="viewerMemberId" required defaultValue="">
            <option value="" disabled>
              {labels.privacy.shareChoose}
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.privacy.shareSharing : labels.privacy.shareSubmit}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Taking sharing back — this entity's "remove" (CLAUDE.md rule 12). */
export function RevokeHealthConsentButton({
  householdId,
  consent,
  viewerName,
  labels,
}: {
  householdId: string;
  consent: HealthConsent;
  viewerName: string;
  labels: HealthFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(revokeHealthConsentAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) setOpen(false);
  }, [pending, state.error]);

  return (
    <>
      <Pill
        type="button"
        tone="quiet"
        onClick={() => setOpen(true)}
        aria-label={withName(labels.privacy.revokeLabel, viewerName)}
        title={withName(labels.privacy.revokeLabel, viewerName)}
      >
        <UserX aria-hidden className="size-3.5" />
      </Pill>

      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={withName(labels.privacy.revokeTitle, viewerName)}
        description={withName(labels.privacy.revokeDescription, viewerName)}
        confirmLabel={labels.privacy.revokeConfirm}
        destructive
        pending={pending}
        onConfirm={() => {
          submitted.current = true;
          const formData = new FormData();
          formData.set("householdId", householdId);
          formData.set("consentId", consent.id);
          startTransition(() => formAction(formData));
        }}
      >
        {state.error ? <p className="text-sm text-[var(--wh-risk)]">{state.error}</p> : null}
      </ConfirmationSheet>
    </>
  );
}
