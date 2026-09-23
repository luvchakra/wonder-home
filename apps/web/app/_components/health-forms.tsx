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
import {
  grantHealthConsentAction,
  revokeHealthConsentAction,
  setHealthAiAssistanceAction,
  setHealthPrivacyScopeAction,
} from "../(auth)/health-actions";

const SCOPES = [
  { value: "private", label: "Only me", hint: "Nobody else in the household can see it." },
  { value: "selected_family", label: "People I choose", hint: "Only the people you specifically share it with, below." },
  { value: "household_operational", label: "The whole household", hint: "Anyone in the household — for things like \"unavailable 5–6pm\", not the details." },
] as const;

/** The privacy-scope choice itself — submits the moment a new option is picked. */
export function PrivacyScopeForm({
  householdId,
  memberId,
  currentScope,
}: {
  householdId: string;
  memberId: string;
  currentScope: (typeof SCOPES)[number]["value"];
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
      <Select label="Who can see your health data" name="privacyScope" defaultValue={currentScope}>
        {SCOPES.map((scope) => (
          <option key={scope.value} value={scope.value}>
            {scope.label}
          </option>
        ))}
      </Select>
      <p className="text-xs text-[var(--wh-foreground-subtle)]">
        {SCOPES.find((scope) => scope.value === currentScope)?.hint}
      </p>
    </form>
  );
}

/** Whether HomeBrain may use this member's health data when it reasons about the household. */
export function HealthAiAssistanceToggle({
  householdId,
  memberId,
  enabled,
}: {
  householdId: string;
  memberId: string;
  enabled: boolean;
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
          <p className="text-sm font-medium">Let HomeBrain use this</p>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">
            When on, WonderHome can consider your health data — appointments, reminders — while it reasons about the household. It is never shown to anyone your privacy setting above excludes.
          </p>
        </div>
        <Switch
          checked={checked}
          disabled={pending}
          onCheckedChange={(next) => {
            setChecked(next);
            requestAnimationFrame(() => formRef.current?.requestSubmit());
          }}
          label="Let HomeBrain use this member's health data"
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
}: {
  householdId: string;
  subjectMemberId: string;
  candidates: { id: string; displayName: string }[];
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
        <Plus aria-hidden className="size-3.5" /> Share with someone
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Share your health data" description="They will be able to see it in their own view, until you remove it again.">
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
          <Select label="Share with" name="viewerMemberId" required defaultValue="">
            <option value="" disabled>
              Choose someone
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Sharing…" : "Share"}
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
}: {
  householdId: string;
  consent: HealthConsent;
  viewerName: string;
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
        aria-label={`Stop sharing with ${viewerName}`}
        title={`Stop sharing with ${viewerName}`}
      >
        <UserX aria-hidden className="size-3.5" />
      </Pill>

      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={`Stop sharing with ${viewerName}?`}
        description={`${viewerName} will no longer be able to see this health data.`}
        confirmLabel="Stop sharing"
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
