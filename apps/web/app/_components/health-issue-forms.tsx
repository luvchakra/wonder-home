"use client";

import { Activity, CircleCheck, Pencil, Plus, RotateCcw, Stethoscope } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import type { IssueStatus } from "@wonderhome/core/health/issues";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { createIssueAction, setIssueStatusAction, updateIssueAction } from "../(auth)/health-issue-actions";
import { withName, type HealthFormLabels } from "../_lib/health-form-labels";

/** The stored values, in the order they are offered; their words come from `labels` (story 22-004). */
const SCOPES = ["private", "selected_family", "household_operational"] as const;

/** Recording a new health issue — a household member's own observation, never a diagnosis. */
export function AddIssueButton({
  householdId,
  members,
  defaultPrivacyScope,
  labels,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  labels: HealthFormLabels;
}) {
  const words = labels.issue;
  const common = labels.common;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createIssueAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      setOpen(false);
      submitted.current = false;
    }
  }, [pending, state.error]);

  if (members.length === 0) return null;

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {words.add}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={words.title} description={words.description}>
        <form
          action={(formData) => {
            submitted.current = true;
            formAction(formData);
          }}
          className="space-y-3"
        >
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Select label={common.whoFor} name="memberId" defaultValue={members[0]?.id ?? ""}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <Field label={words.whatsGoingOn} name="label" placeholder={words.whatsGoingOnPlaceholder} required autoComplete="off" />
          <Field label={words.detail} name="description" placeholder={words.detailPlaceholder} autoComplete="off" />
          <Field label={common.notes} name="notes" placeholder={common.notesPlaceholderElse} autoComplete="off" />
          <Field label={words.since} name="startedAt" type="date" />
          <Select label={common.whoCanSee} name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {labels.scopes[scope]}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.recording : common.record}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Editing what an issue says — its content, never its status (see IssueStatusActions below). */
export function EditIssueButton({
  householdId,
  issueId,
  label,
  description,
  notes,
  labels,
}: {
  householdId: string;
  issueId: string;
  label: string;
  description: string | null;
  notes: string | null;
  labels: HealthFormLabels;
}) {
  const words = labels.issue;
  const common = labels.common;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateIssueAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      setOpen(false);
      submitted.current = false;
    }
  }, [pending, state.error]);

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={withName(common.editNamed, label)} title={common.edit}>
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={words.editTitle} description={words.editDescription}>
        <form
          action={(formData) => {
            submitted.current = true;
            formAction(formData);
          }}
          className="space-y-3"
        >
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="issueId" value={issueId} />
          <Field label={words.whatsGoingOn} name="label" defaultValue={label} required autoComplete="off" />
          <Field label={words.detail} name="description" defaultValue={description ?? ""} autoComplete="off" />
          <Field label={common.notes} name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.saving : common.save}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

type StatusAction = keyof HealthFormLabels["issueStatusActions"];

const NEXT_STATUS: Record<IssueStatus, { status: IssueStatus; icon: typeof Activity; label: StatusAction }[]> = {
  mentioned: [
    { status: "active", icon: Activity, label: "startTracking" },
    { status: "resolved", icon: CircleCheck, label: "resolved" },
  ],
  active: [
    { status: "monitoring", icon: Stethoscope, label: "monitor" },
    { status: "resolved", icon: CircleCheck, label: "resolved" },
  ],
  monitoring: [
    { status: "active", icon: Activity, label: "activeAgain" },
    { status: "resolved", icon: CircleCheck, label: "resolved" },
  ],
  resolved: [{ status: "active", icon: RotateCcw, label: "reopen" }],
  closed: [{ status: "active", icon: RotateCcw, label: "reopen" }],
};

/** Moving an issue through mentioned → active → monitoring → resolved, or reopening it (CLAUDE.md rule 12: nothing here is one-way). */
export function IssueStatusActions({
  householdId,
  issueId,
  status,
  labels,
}: {
  householdId: string;
  issueId: string;
  status: IssueStatus;
  labels: HealthFormLabels;
}) {
  const [, formAction, pending] = useActionState<ActionState, FormData>(setIssueStatusAction, {});

  const submit = (next: IssueStatus) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("issueId", issueId);
    formData.set("status", next);
    startTransition(() => formAction(formData));
  };

  const options = NEXT_STATUS[status];
  if (options.length === 0) return null;

  return (
    <div className="flex gap-1.5">
      {options.map(({ status: next, icon: Icon, label }) => (
        <Pill
          key={next}
          type="button"
          tone="soft"
          disabled={pending}
          onClick={() => submit(next)}
          aria-label={labels.issueStatusActions[label]}
          title={labels.issueStatusActions[label]}
        >
          <Icon aria-hidden className="size-3.5" />
        </Pill>
      ))}
    </div>
  );
}
