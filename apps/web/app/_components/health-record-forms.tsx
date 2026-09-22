"use client";

import { Ban, Pencil, Plus, RotateCcw } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import type { RecordType } from "@wonderhome/core/health/records";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  archiveRecordAction,
  createRecordAction,
  reactivateRecordAction,
  updateRecordAction,
} from "../(auth)/health-record-actions";

const TYPE_OPTIONS: { value: RecordType; label: string }[] = [
  { value: "lab_result", label: "Lab result" },
  { value: "prescription", label: "Prescription" },
  { value: "imaging_report", label: "Imaging report" },
  { value: "vaccination_certificate", label: "Vaccination certificate" },
  { value: "discharge_summary", label: "Discharge summary" },
  { value: "referral", label: "Referral" },
  { value: "insurance_document", label: "Insurance document" },
  { value: "visit_summary", label: "Visit summary" },
  { value: "other", label: "Other" },
];

const SCOPE_OPTIONS = [
  { value: "private", label: "Only me" },
  { value: "selected_family", label: "People I choose" },
  { value: "household_operational", label: "The whole household" },
] as const;

/** Filing a health document by hand — HomeSend's own confirm writes through routeHomeSendItemAction instead (story 21-005). */
export function AddRecordButton({
  householdId,
  members,
  defaultPrivacyScope,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createRecordAction, {});
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
        <Plus aria-hidden className="size-3.5" /> Add a record
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Add a health record" description="A lab result, prescription or similar — filed for yourself, or a child you guard.">
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
          <Select label="Whose record?" name="memberId" defaultValue={members[0]?.id ?? ""}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <Field label="What is it" name="label" placeholder="Blood test results" required autoComplete="off" />
          <Select label="Kind of document" name="recordType" defaultValue="other">
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Field label="Document date (optional)" name="documentDate" type="date" />
          <Field label="Notes (optional)" name="notes" placeholder="Anything worth remembering" autoComplete="off" />
          <Select label="Who can see this" name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Filing…" : "File record"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Editing a record's own content — never its file, only what describes it. */
export function EditRecordButton({
  householdId,
  recordId,
  label,
  recordType,
  documentDate,
  notes,
}: {
  householdId: string;
  recordId: string;
  label: string;
  recordType: RecordType;
  documentDate: string | null;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateRecordAction, {});
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

      <Sheet open={open} onOpenChange={setOpen} title="Edit record" description="Update what this document is or when it's dated.">
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
          <input type="hidden" name="recordId" value={recordId} />
          <Field label="What is it" name="label" defaultValue={label} required autoComplete="off" />
          <Select label="Kind of document" name="recordType" defaultValue={recordType}>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Field label="Document date (optional)" name="documentDate" type="date" defaultValue={documentDate ?? ""} />
          <Field label="Notes (optional)" name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/**
 * A record row's actions — edit, or remove (and bring back once removed), so
 * every record can be added, updated and removed (CLAUDE.md rule 12).
 */
export function RecordActions({
  householdId,
  record,
}: {
  householdId: string;
  record: {
    id: string;
    label: string;
    recordType: RecordType;
    documentDate: string | null;
    notes: string | null;
    status: "active" | "archived";
  };
}) {
  const [, archiveAction, archivePending] = useActionState<ActionState, FormData>(archiveRecordAction, {});
  const [, reactivateAction, reactivatePending] = useActionState<ActionState, FormData>(reactivateRecordAction, {});

  const submit = (action: (formData: FormData) => void) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("recordId", record.id);
    action(formData);
  };

  if (record.status === "archived") {
    return (
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label="Bring back" title="Bring back">
        <RotateCcw aria-hidden className="size-3.5" />
      </Pill>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <EditRecordButton
        householdId={householdId}
        recordId={record.id}
        label={record.label}
        recordType={record.recordType}
        documentDate={record.documentDate}
        notes={record.notes}
      />
      <Pill type="button" tone="quiet" disabled={archivePending} onClick={() => submit(archiveAction)} aria-label="Remove" title="Remove">
        <Ban aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
