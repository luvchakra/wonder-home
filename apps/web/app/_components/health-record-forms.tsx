"use client";

import { Ban, Paperclip, Pencil, Plus, RotateCcw } from "lucide-react";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";

import type { RecordType } from "@wonderhome/core/health/records";
import { REPORT_ACCEPT, REPORT_MAX_BYTES } from "@wonderhome/core/health/report-limits";
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
import { withName, type HealthFormLabels } from "../_lib/health-form-labels";
import { HealthPrivacyField } from "./health-privacy-field";

/** The stored values, in the order they are offered; their words come from `labels` (story 22-004). */
const TYPES: RecordType[] = [
  "lab_result",
  "prescription",
  "imaging_report",
  "vaccination_certificate",
  "discharge_summary",
  "referral",
  "insurance_document",
  "visit_summary",
  "other",
];

/**
 * "Attach the report" (story 21-012): a PDF or a photo, sent with the rest of
 * the sheet and checked again on the server from its bytes. In an edit sheet
 * a report already attached can be replaced, or removed (rule 12). Posts
 * `report` (the file) and `removeReport` ("true" to take it off the record).
 */
function ReportFileField({ labels, hasReport = false }: { labels: HealthFormLabels; hasReport?: boolean }) {
  const words = labels.healthRecord;
  const id = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
        <Paperclip aria-hidden className="size-3.5" /> {hasReport ? words.replace : words.attach}
      </label>
      {hasReport ? <p className="text-xs text-[var(--wh-foreground-muted)]">{words.hasReport}</p> : null}
      <input
        id={id}
        type="file"
        name="report"
        accept={REPORT_ACCEPT}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          if (file && file.size > REPORT_MAX_BYTES) {
            event.currentTarget.value = "";
            setChosen(null);
            setProblem(words.tooLarge);
            return;
          }
          setProblem(null);
          setChosen(file?.name ?? null);
          if (file) setRemove(false);
        }}
        className="block w-full min-w-0 text-sm text-[var(--wh-foreground-muted)] file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-[var(--wh-primary-soft)] file:px-4 file:text-sm file:font-medium file:text-[var(--wh-primary)]"
      />
      {chosen ? <p className="text-xs break-words text-[var(--wh-foreground-muted)]">{chosen}</p> : null}
      <p className="text-xs text-[var(--wh-foreground-subtle)]">{words.attachHint}</p>
      {problem ? <p className="text-xs text-[var(--wh-risk)]">{problem}</p> : null}
      {hasReport && !chosen ? (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={remove} onChange={(event) => setRemove(event.currentTarget.checked)} className="size-4 accent-[var(--wh-primary)]" />
          {words.removeReport}
        </label>
      ) : null}
      <input type="hidden" name="removeReport" value={remove && !chosen ? "true" : "false"} />
    </div>
  );
}

/** Filing a health document by hand — HomeSend's own confirm writes through routeHomeSendItemAction instead (story 21-005). */
export function AddRecordButton({
  householdId,
  members,
  defaultPrivacyScope,
  labels,
  defaultOpen = false,
  hideTrigger = false,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  labels: HealthFormLabels;
  /** Opens as it mounts — picked from the page's Add menu rather than its own pill. */
  defaultOpen?: boolean;
  /** Leaves its own pill out, when the Add menu is how it is reached. */
  hideTrigger?: boolean;
}) {
  const words = labels.healthRecord;
  const common = labels.common;
  const [open, setOpen] = useState(defaultOpen);
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
      {hideTrigger ? null : (
        <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
          <Plus aria-hidden className="size-3.5" /> {words.add}
        </Pill>
      )}

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
          <Select label={words.whose} name="memberId" defaultValue={members[0]?.id ?? ""}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <Field label={words.what} name="label" placeholder={words.whatPlaceholder} required autoComplete="off" />
          <Select label={words.kind} name="recordType" defaultValue="other">
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {labels.recordTypes[type]}
              </option>
            ))}
          </Select>
          <Field label={words.date} name="documentDate" type="date" />
          <Field label={common.notes} name="notes" placeholder={common.notesPlaceholder} autoComplete="off" />
          <ReportFileField labels={labels} />
          <HealthPrivacyField labels={labels} defaultValue={defaultPrivacyScope} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? words.filing : words.submit}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Editing a record: what describes it, who can see it, and its attached report (replace or remove). */
export function EditRecordButton({
  householdId,
  recordId,
  label,
  recordType,
  documentDate,
  notes,
  memberId,
  privacyScope,
  hasReport,
  labels,
}: {
  householdId: string;
  recordId: string;
  label: string;
  recordType: RecordType;
  documentDate: string | null;
  notes: string | null;
  memberId: string;
  hasReport: boolean;
  privacyScope: "private" | "selected_family" | "household_operational";
  labels: HealthFormLabels;
}) {
  const words = labels.healthRecord;
  const common = labels.common;
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
          <input type="hidden" name="recordId" value={recordId} />
          <Field label={words.what} name="label" defaultValue={label} required autoComplete="off" />
          <Select label={words.kind} name="recordType" defaultValue={recordType}>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {labels.recordTypes[type]}
              </option>
            ))}
          </Select>
          <Field label={words.date} name="documentDate" type="date" defaultValue={documentDate ?? ""} />
          <Field label={common.notes} name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <ReportFileField labels={labels} hasReport={hasReport} />
          <HealthPrivacyField labels={labels} defaultValue={privacyScope} subjectMemberId={memberId} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.saving : common.save}
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
  labels,
}: {
  householdId: string;
  record: {
    id: string;
    label: string;
    recordType: RecordType;
    documentDate: string | null;
    notes: string | null;
    status: "active" | "archived";
    memberId: string;
    privacyScope: "private" | "selected_family" | "household_operational";
    filePath: string | null;
  };
  labels: HealthFormLabels;
}) {
  const common = labels.common;
  const [, archiveAction, archivePending] = useActionState<ActionState, FormData>(archiveRecordAction, {});
  const [, reactivateAction, reactivatePending] = useActionState<ActionState, FormData>(reactivateRecordAction, {});

  const submit = (action: (formData: FormData) => void) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("recordId", record.id);
    startTransition(() => action(formData));
  };

  if (record.status === "archived") {
    return (
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label={common.bringBack} title={common.bringBack}>
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
        memberId={record.memberId}
        privacyScope={record.privacyScope}
        hasReport={record.filePath !== null}
        labels={labels}
      />
      <Pill type="button" tone="quiet" disabled={archivePending} onClick={() => submit(archiveAction)} aria-label={common.remove} title={common.remove}>
        <Ban aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
