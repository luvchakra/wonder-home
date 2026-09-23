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

const SCOPE_OPTIONS = [
  { value: "private", label: "Only me" },
  { value: "selected_family", label: "People I choose" },
  { value: "household_operational", label: "The whole household" },
] as const;

/** Recording a new health issue — a household member's own observation, never a diagnosis. */
export function AddIssueButton({
  householdId,
  members,
  defaultPrivacyScope,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
}) {
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
        <Plus aria-hidden className="size-3.5" /> Record an issue
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Record a health issue" description="What you've noticed — never a diagnosis, just something worth remembering.">
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
          <Select label="Who is this for?" name="memberId" defaultValue={members[0]?.id ?? ""}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <Field label="What's going on" name="label" placeholder="Sore throat" required autoComplete="off" />
          <Field label="More detail (optional)" name="description" placeholder="Started yesterday evening" autoComplete="off" />
          <Field label="Notes (optional)" name="notes" placeholder="Anything else worth remembering" autoComplete="off" />
          <Field label="Since (optional)" name="startedAt" type="date" />
          <Select label="Who can see this" name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Recording…" : "Record"}
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
}: {
  householdId: string;
  issueId: string;
  label: string;
  description: string | null;
  notes: string | null;
}) {
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
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={`Edit ${label}`} title="Edit">
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Edit issue" description="Update what this says.">
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
          <Field label="What's going on" name="label" defaultValue={label} required autoComplete="off" />
          <Field label="More detail (optional)" name="description" defaultValue={description ?? ""} autoComplete="off" />
          <Field label="Notes (optional)" name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

const NEXT_STATUS: Record<IssueStatus, { status: IssueStatus; icon: typeof Activity; label: string }[]> = {
  mentioned: [
    { status: "active", icon: Activity, label: "Start tracking" },
    { status: "resolved", icon: CircleCheck, label: "Resolved" },
  ],
  active: [
    { status: "monitoring", icon: Stethoscope, label: "Monitor" },
    { status: "resolved", icon: CircleCheck, label: "Resolved" },
  ],
  monitoring: [
    { status: "active", icon: Activity, label: "Active again" },
    { status: "resolved", icon: CircleCheck, label: "Resolved" },
  ],
  resolved: [{ status: "active", icon: RotateCcw, label: "Reopen" }],
  closed: [{ status: "active", icon: RotateCcw, label: "Reopen" }],
};

/** Moving an issue through mentioned → active → monitoring → resolved, or reopening it (CLAUDE.md rule 12: nothing here is one-way). */
export function IssueStatusActions({ householdId, issueId, status }: { householdId: string; issueId: string; status: IssueStatus }) {
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
        <Pill key={next} type="button" tone="soft" disabled={pending} onClick={() => submit(next)} aria-label={label} title={label}>
          <Icon aria-hidden className="size-3.5" />
        </Pill>
      ))}
    </div>
  );
}
