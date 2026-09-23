"use client";

import { Mic, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

import type { IntakeUnderstanding } from "@wonderhome/core/homesend/understanding";
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

const CHANNEL_LABEL: Record<string, string> = {
  manual_upload: "A file you sent",
  pasted_text: "Something you pasted",
  link: "A web page",
  audio_note: "A voice note",
  email: "A forwarded email",
  email_attachment: "An email attachment",
};

const CONTENT_LABEL: Record<string, string> = {
  "application/pdf": "A PDF you sent",
  "text/plain": "A text file you sent",
  "text/csv": "A spreadsheet (CSV) you sent",
  "image/jpeg": "A photo you sent",
  "image/png": "A photo you sent",
  "image/webp": "A photo you sent",
};

const CONFIDENCE_LABEL: Record<IntakeUnderstanding["confidence"], string> = { high: "High", medium: "Medium", low: "Low" };

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "School email · 23 Sep" (§13): where it came from and when, in words. */
export function describeSource(
  understanding: Pick<IntakeUnderstanding, "provenance"> | null | undefined,
  options: { contentType?: string | null; receivedAt?: string | null } = {},
): string {
  const provenance = understanding?.provenance;
  let label = provenance ? (CHANNEL_LABEL[provenance.channel] ?? "Something you sent") : "Something you sent";
  const contentType = options.contentType ?? provenance?.contentType ?? null;
  if (provenance?.channel === "manual_upload" && contentType && CONTENT_LABEL[contentType]) label = CONTENT_LABEL[contentType]!;
  if (provenance?.channel === "link" && provenance.url) {
    try {
      label = `A web page on ${new URL(provenance.url).hostname}`;
    } catch {
      // keep the plain label
    }
  }
  if (provenance?.channel === "email" && provenance.subject) label = `A forwarded email: "${provenance.subject}"`;
  const when = options.receivedAt ? new Date(options.receivedAt) : null;
  // One fixed format ("23 Sep", as §13 writes it), so the server's render and the browser's agree.
  const day = when && !Number.isNaN(when.getTime()) ? `${when.getUTCDate()} ${SHORT_MONTHS[when.getUTCMonth()]}` : null;
  return day ? `${label} · ${day}` : label;
}

/**
 * "What I found" (§13): the summary, where it came from, how sure WonderHome
 * is — in words, never a bare score — and, when the content tried to
 * instruct WonderHome, that those instructions were ignored.
 */
export function HomeSendFindings({
  understanding,
  contentType,
  receivedAt,
}: {
  understanding: IntakeUnderstanding | null | undefined;
  contentType?: string | null;
  receivedAt?: string | null;
}) {
  if (!understanding) return null;
  const needs = understanding.candidateActions.filter((action) => action.type === "add_household_need");
  return (
    <div className="space-y-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-3 text-sm">
      <p className="font-medium">What I found</p>
      {understanding.readable && understanding.contentSummary ? <p>{understanding.contentSummary}</p> : <p className="text-[var(--wh-foreground-muted)]">WonderHome couldn&apos;t read this on its own — fill in what it is below.</p>}
      {needs.length > 1 ? (
        <p className="text-xs text-[var(--wh-foreground-muted)]">
          It also asks for {needs.map((need) => String(need.fields.title)).join(", ")}.
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-[var(--wh-foreground-subtle)]">Source</dt>
        <dd>{describeSource(understanding, { contentType, receivedAt })}</dd>
        {understanding.readable ? (
          <>
            <dt className="text-[var(--wh-foreground-subtle)]">Confidence</dt>
            <dd>{CONFIDENCE_LABEL[understanding.confidence]}</dd>
          </>
        ) : null}
        {understanding.provenance.transcriptConfidence !== null && understanding.provenance.transcriptConfidence < 1 ? (
          <>
            <dt className="text-[var(--wh-foreground-subtle)]">Heard</dt>
            <dd>From a voice note — check names and dates</dd>
          </>
        ) : null}
      </dl>
      {understanding.safety.instructionsIgnored ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--wh-foreground-muted)]">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>This contained instructions aimed at WonderHome. They were ignored — nothing you&apos;re sent can tell WonderHome what to do.</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * A voice note WonderHome is not sure it heard right (§17): it shows what
 * it heard and waits — the household confirms it or types what was said,
 * and only then is it read.
 */
export function TranscriptCheck({
  householdId,
  itemId,
  heard,
  action,
  error,
  busy,
}: {
  householdId: string;
  itemId: string;
  heard: { text: string; prompt: string };
  action: (formData: FormData) => void;
  error?: string;
  busy: boolean;
}) {
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={itemId} />
      {error ? <Alert>{error}</Alert> : null}
      <p className="flex items-start gap-2 text-sm">
        <Mic aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
        <span>{heard.prompt}</span>
      </p>
      <label htmlFor={`heard-${itemId}`} className="block text-sm font-medium">What I heard</label>
      <textarea
        id={`heard-${itemId}`}
        name="text"
        rows={4}
        required
        defaultValue={heard.text}
        className="block w-full resize-none rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
      />
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Reading…" : "That's what was said"}
      </Button>
    </form>
  );
}

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
  understanding,
  contentType,
  receivedAt,
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
  /** The canonical reading (Wave 3 §8), shown as "What I found". */
  understanding?: IntakeUnderstanding | null;
  contentType?: string | null;
  receivedAt?: string | null;
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

      <HomeSendFindings understanding={understanding} contentType={contentType} receivedAt={receivedAt} />

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
