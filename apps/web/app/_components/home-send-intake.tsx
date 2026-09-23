"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";

export const OBLIGATION_KIND_OPTIONS = [
  { value: "utility", label: "Utility" },
  { value: "rent", label: "Rent" },
  { value: "school_fee", label: "School fee" },
  { value: "subscription", label: "Subscription" },
  { value: "insurance", label: "Insurance" },
  { value: "loan", label: "Loan" },
  { value: "tax", label: "Tax" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
];

export const SCHOOL_KIND_OPTIONS = [
  { value: "homework", label: "Homework" },
  { value: "worksheet", label: "Worksheet" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "event", label: "Event" },
  { value: "notice", label: "Notice" },
];

export const KIND_OPTIONS = [
  { value: "bill", label: "A bill" },
  { value: "school_item", label: "School work" },
  { value: "grocery_item", label: "A grocery item" },
  { value: "health_document", label: "A health document" },
];

export const RECORD_TYPE_OPTIONS = [
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

export const selectClass =
  "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";

export type HomeSendExtractionFields = {
  title: string | null;
  notes: string | null;
  billKind: string | null;
  payee: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  schoolKind: string | null;
  subject: string | null;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  healthRecordType: string | null;
  documentDate: string | null;
  subjectMemberName: string | null;
  secondary: { reason: string; title: string } | null;
} | null;

/**
 * The confirm form for one classified item — shared by `HomeSendSheet` (the
 * composer's paperclip) and the `/home-send` page's own inbox, so the same
 * never-write-without-review shape lives in one place. Keyed by `item.id` by
 * whichever caller renders it, so a freshly classified item gets its own
 * fresh `kind` state on mount rather than one reset by an effect.
 */
export function HomeSendConfirmStep({
  item,
  defaultKind,
  prefill,
  kids,
  householdId,
  routeAction,
  routeError,
  notice,
  reconciliation,
  busy,
}: {
  item: { id: string };
  defaultKind: string;
  prefill: HomeSendExtractionFields;
  kids: { id: string; displayName: string }[];
  householdId: string;
  routeAction: (formData: FormData) => void;
  routeError?: string;
  notice?: string;
  /** A record this already looks like (Wave 1 §7) — shown, never silently duplicated. */
  reconciliation?: { verdict: string; message: string } | null;
  busy: boolean;
}) {
  const [kind, setKind] = useState(defaultKind);
  const [includeSecondary, setIncludeSecondary] = useState(false);
  const secondary = kind !== "grocery_item" ? prefill?.secondary : null;

  return (
    <form action={routeAction} className="space-y-3">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={item.id} />
      {routeError ? <Alert>{routeError}</Alert> : null}
      {notice ? (
        <Alert tone="info">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles aria-hidden className="size-3.5" /> {notice}
          </span>
        </Alert>
      ) : null}

      {reconciliation ? (
        <div className="space-y-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-3">
          <p className="text-sm">
            <span className="block font-medium">{reconciliation.verdict === "likely_update" || reconciliation.verdict === "contradiction" ? "This may already be on record, with different details" : "This may already be on record"}</span>
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">{reconciliation.message}</span>
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmDuplicate" className="mt-0.5" />
            <span>It&apos;s a different one — add it anyway</span>
          </label>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="kind" className="block text-sm font-medium">This is</label>
        <select id="kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value)} className={selectClass}>
          {KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <HomeSendConfirmFields kind={kind} prefill={prefill} kids={kids} />

      {secondary ? (
        <div className="space-y-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="includeSecondary"
              checked={includeSecondary}
              onChange={(event) => setIncludeSecondary(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium">Also add to Groceries</span>
              <span className="block text-xs text-[var(--wh-foreground-subtle)]">{secondary.reason}</span>
            </span>
          </label>
          {includeSecondary ? (
            <Field label="What is it?" name="secondaryTitle" defaultValue={secondary.title} autoComplete="off" />
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          Add
        </Button>
      </div>
    </form>
  );
}

/**
 * The kind-specific fields, swapped by the `kind` select above it — the
 * parent owns that selection so both controls read the one piece of state.
 */
export function HomeSendConfirmFields({
  kind,
  prefill,
  kids,
}: {
  kind: string;
  prefill: HomeSendExtractionFields;
  kids: { id: string; displayName: string }[];
}) {
  return (
    <>
      <Field label="What is it?" name="title" required defaultValue={prefill?.title ?? ""} autoComplete="off" />

      {kind === "bill" ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="billKind" className="block text-sm font-medium">Kind of bill</label>
            <select id="billKind" name="billKind" defaultValue={prefill?.billKind ?? "other"} className={selectClass}>
              {OBLIGATION_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <Field label="Payee (optional)" name="payee" defaultValue={prefill?.payee ?? ""} autoComplete="off" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (optional)" name="amount" type="number" min={0} step="0.01" defaultValue={prefill?.amount ?? ""} />
            <Field label="Currency (optional)" name="currency" defaultValue={prefill?.currency ?? ""} placeholder="INR" autoComplete="off" />
          </div>
          <Field label="Due (optional)" name="dueDate" type="date" defaultValue={prefill?.dueDate ?? ""} />
        </>
      ) : kind === "school_item" ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="childMemberId" className="block text-sm font-medium">For</label>
            <select id="childMemberId" name="childMemberId" className={selectClass} defaultValue={kids[0]?.id ?? ""}>
              {kids.length === 0 ? <option value="">No children on this household yet</option> : null}
              {kids.map((kid) => (
                <option key={kid.id} value={kid.id}>{kid.displayName}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="schoolKind" className="block text-sm font-medium">Kind</label>
            <select id="schoolKind" name="schoolKind" defaultValue={prefill?.schoolKind ?? "homework"} className={selectClass}>
              {SCHOOL_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <Field label="Subject (optional)" name="subject" defaultValue={prefill?.subject ?? ""} autoComplete="off" />
          <Field label="Due (optional)" name="dueDate" type="date" defaultValue={prefill?.dueDate ?? ""} />
        </>
      ) : kind === "health_document" ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="subjectMemberId" className="block text-sm font-medium">Whose record is this?</label>
            <select id="subjectMemberId" name="subjectMemberId" className={selectClass} defaultValue="">
              <option value="">Me</option>
              {kids.map((kid) => (
                <option key={kid.id} value={kid.id}>{kid.displayName}</option>
              ))}
            </select>
            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              {prefill?.subjectMemberName ? `WonderHome read the name "${prefill.subjectMemberName}" on this document. ` : ""}
              Only you, or a child you look after, right now — anyone else needs to send it in themselves.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="healthRecordType" className="block text-sm font-medium">Kind of document</label>
            <select id="healthRecordType" name="healthRecordType" defaultValue={prefill?.healthRecordType ?? "other"} className={selectClass}>
              {RECORD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <Field label="Document date (optional)" name="documentDate" type="date" defaultValue={prefill?.documentDate ?? ""} />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity (optional)" name="quantity" type="number" min={0.01} step="0.01" defaultValue={prefill?.quantity ?? ""} />
          <Field label="Unit (optional)" name="unit" defaultValue={prefill?.unit ?? ""} placeholder="kg, pack, box" autoComplete="off" />
          <div className="col-span-2">
            <Field label="Category (optional)" name="category" defaultValue={prefill?.category ?? ""} placeholder="grocery" autoComplete="off" />
          </div>
        </div>
      )}

      <Field label="Notes (optional)" name="notes" defaultValue={prefill?.notes ?? ""} autoComplete="off" />
    </>
  );
}
