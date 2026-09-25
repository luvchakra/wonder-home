"use client";

import { Mic, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

import { isConsequentialInstruction } from "@wonderhome/core/homesend/audio";
import type { DocumentPlan } from "@wonderhome/core/homesend/plan";
import type { IntakeUnderstanding } from "@wonderhome/core/homesend/understanding";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";

import { countWords, fillIn, type HomeSendReviewLabels, type HomeSendSourceLabels } from "../_lib/homesend-labels";
import { DocumentPlanReview } from "./home-send-plan";
import { HomeSendReceiptFields } from "./home-send-receipt";

/** The stored values each picker offers; their words come from `labels.options`, by value. */
const OBLIGATION_KIND_VALUES = ["utility", "rent", "school_fee", "subscription", "insurance", "loan", "tax", "service", "other"];

const SCHOOL_KIND_VALUES = ["homework", "worksheet", "exam", "project", "event", "notice"];

const KIND_VALUES = ["bill", "school_item", "grocery_item", "health_document", "receipt"];

const RECORD_TYPE_VALUES = [
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

/** What the review step shows of a reconciliation (`homesend/reconcile.ts`). */
export type ReviewReconciliation = {
  verdict: string;
  message: string;
  existingId?: string;
  proposal?: { type: "duplicate" | "update" | "cancellation" | "conflict" };
};

/** How the item is confirmed (`homesend/confirmation.ts`, Wave 3 §12). */
export type ReviewConfirmation = {
  mode: "auto_apply" | "prepare" | "ask" | "govern";
  reason: string;
  question: string | null;
};

/** Who it is for (`homesend/resolve.ts`). */
export type ReviewSubject = {
  said: string | null;
  selected: { memberId: string; displayName: string } | null;
  candidates: { memberId: string; displayName: string }[];
  question: string | null;
  /** The content named somebody who is not on record (story 08-009). */
  unknown?: boolean;
};

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
  dueTime?: string | null;
  endTime?: string | null;
  schoolKind: string | null;
  subject: string | null;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  healthRecordType: string | null;
  documentDate: string | null;
  subjectMemberName: string | null;
  merchant?: string | null;
  lines?: { name: string; quantity: number | null; unit: string | null; lineTotal: number | null }[];
  secondary: { reason: string; title: string } | null;
  needs?: { reason: string; title: string }[];
} | null;

/** What a WhatsApp attachment was, from its bytes — "A photo sent on WhatsApp" (story 14-016). */
function whatsappMediaLabel(contentType: string | null, words: HomeSendSourceLabels): string {
  if (!contentType) return words.channel.whatsapp_media!;
  if (contentType.startsWith("image/")) return words.whatsappPhoto;
  if (contentType.startsWith("audio/")) return words.whatsappVoice;
  if (contentType === "application/pdf") return words.whatsappPdf;
  return words.channel.whatsapp_media!;
}

/** "School email · 23 Sep" (§13): where it came from and when, in words. */
export function describeSource(
  understanding: Pick<IntakeUnderstanding, "provenance"> | null | undefined,
  options: { contentType?: string | null; receivedAt?: string | null; from?: string | null },
  words: HomeSendSourceLabels,
): string {
  const provenance = understanding?.provenance;
  let label = provenance ? (words.channel[provenance.channel] ?? words.something) : words.something;
  const contentType = options.contentType ?? provenance?.contentType ?? null;
  if (provenance?.channel === "manual_upload" && contentType && words.content[contentType]) label = words.content[contentType]!;
  if (provenance?.channel === "link" && provenance.url) {
    try {
      label = fillIn(words.webPageOn, { host: new URL(provenance.url).hostname });
    } catch {
      // keep the plain label
    }
  }
  if (provenance?.channel === "email" && provenance.subject) label = fillIn(words.forwardedEmail, { subject: provenance.subject });
  if (provenance?.channel === "whatsapp_media") label = whatsappMediaLabel(contentType, words);
  // WhatsApp items always come from one linked member; saying who is the provenance.
  if ((provenance?.channel === "whatsapp" || provenance?.channel === "whatsapp_media") && options.from) label = fillIn(words.from, { label, name: options.from });
  const when = options.receivedAt ? new Date(options.receivedAt) : null;
  // One fixed form ("23 Sep", as §13 writes it), on the UTC day, so the server's render and the browser's agree.
  const day = when && !Number.isNaN(when.getTime()) ? fillIn(words.day, { day: when.getUTCDate(), month: words.months[when.getUTCMonth()] ?? "" }) : null;
  return day ? fillIn(words.when, { label, day }) : label;
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
  labels,
}: {
  understanding: IntakeUnderstanding | null | undefined;
  contentType?: string | null;
  receivedAt?: string | null;
  labels: HomeSendReviewLabels;
}) {
  if (!understanding) return null;
  const words = labels.found;
  const needs = understanding.candidateActions.filter((action) => action.type === "add_household_need");
  return (
    <div className="space-y-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-3 text-sm">
      <p className="font-medium">{words.title}</p>
      {understanding.readable && understanding.contentSummary ? <p>{understanding.contentSummary}</p> : <p className="text-[var(--wh-foreground-muted)]">{words.unreadable}</p>}
      {needs.length > 1 ? (
        <p className="text-xs text-[var(--wh-foreground-muted)]">
          {fillIn(words.alsoAsks, { list: needs.map((need) => String(need.fields.title)).join(", ") })}
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-[var(--wh-foreground-subtle)]">{words.source}</dt>
        <dd>{describeSource(understanding, { contentType, receivedAt }, labels.source)}</dd>
        {understanding.readable ? (
          <>
            <dt className="text-[var(--wh-foreground-subtle)]">{words.confidenceLabel}</dt>
            <dd>{words.confidence[understanding.confidence]}</dd>
          </>
        ) : null}
        {understanding.provenance.transcriptConfidence !== null && understanding.provenance.transcriptConfidence < 1 ? (
          <>
            <dt className="text-[var(--wh-foreground-subtle)]">{words.heard}</dt>
            <dd>{words.heardValue}</dd>
          </>
        ) : null}
      </dl>
      {understanding.safety.instructionsIgnored ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--wh-foreground-muted)]">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{words.instructionsIgnored}</span>
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
  labels,
}: {
  householdId: string;
  itemId: string;
  heard: { text: string; prompt: string };
  action: (formData: FormData) => void;
  error?: string;
  busy: boolean;
  labels: HomeSendReviewLabels;
}) {
  const words = labels.transcript;
  // The same line `uncertainTranscriptPrompt` writes, in the viewer's language:
  // a transcript shown here is always uncertain, so only what it asks decides.
  const prompt = isConsequentialInstruction(heard.text.trim()) ? words.promptConsequential : words.prompt;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={itemId} />
      {error ? <Alert>{error}</Alert> : null}
      <p className="flex items-start gap-2 text-sm">
        <Mic aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
        <span>{prompt}</span>
      </p>
      <label htmlFor={`heard-${itemId}`} className="block text-sm font-medium">{words.heard}</label>
      <textarea
        id={`heard-${itemId}`}
        name="text"
        rows={4}
        required
        defaultValue={heard.text}
        className="block w-full resize-none rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
      />
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? labels.reading : words.confirm}
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
  subject,
  confirmation,
  canAddChild = false,
  plan = null,
  onDone,
  onApplied,
  labels,
}: {
  labels: HomeSendReviewLabels;
  item: { id: string };
  defaultKind: string;
  prefill: HomeSendExtractionFields;
  kids: { id: string; displayName: string }[];
  householdId: string;
  routeAction: (formData: FormData) => void;
  routeError?: string;
  notice?: string;
  /** A record this already looks like (Wave 1 §7, Wave 3 §10) — shown, never silently duplicated, updated or cancelled. */
  reconciliation?: ReviewReconciliation | null;
  busy: boolean;
  /** The canonical reading (Wave 3 §8), shown as "What I found". */
  understanding?: IntakeUnderstanding | null;
  contentType?: string | null;
  receivedAt?: string | null;
  /** Who it is for, resolved through the household's own people (§9). */
  subject?: ReviewSubject | null;
  /** Why this waits for a person, or the one question to answer (§12). */
  confirmation?: ReviewConfirmation | null;
  /** Whether this person may add a child right here (story 08-009) — the Family screen's rule. */
  canAddChild?: boolean;
  /** A document with several records is reviewed as its change plan (DDU 2.0), not as one item. */
  plan?: DocumentPlan | null;
  /** Closes the review once a plan's receipt has been read. */
  onDone?: () => void;
  /** Told once a plan has been applied, so the surrounding screen can drop its "Not worth adding". */
  onApplied?: () => void;
}) {
  const [kind, setKind] = useState(defaultKind);
  const [byHand, setByHand] = useState(false);
  const [planApplied, setPlanApplied] = useState(false);
  const needs = (kind !== "grocery_item" && kind !== "receipt" ? (prefill?.needs?.length ? prefill.needs : prefill?.secondary ? [prefill.secondary] : []) : []).filter(
    (need) => typeof need?.title === "string" && need.title.trim() !== "",
  );
  const proposal = reconciliation?.proposal?.type ?? (reconciliation ? "duplicate" : null);
  const words = labels.confirm;
  const primaryLabel = prefill?.title ?? labels.options.kind[kind] ?? words.this;

  if (plan && !byHand) {
    return (
      <div className="space-y-3">
        <DocumentPlanReview
          householdId={householdId}
          itemId={item.id}
          plan={plan}
          summary={understanding?.contentSummary ?? null}
          labels={labels}
          onDone={onDone}
          onApplied={() => {
            setPlanApplied(true);
            onApplied?.();
          }}
        />
        {planApplied ? null : (
          <Pill type="button" tone="quiet" onClick={() => setByHand(true)} className="w-full justify-center">
            {words.byHand}
          </Pill>
        )}
      </div>
    );
  }

  return (
    <form action={routeAction} className="space-y-3">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={item.id} />
      {reconciliation?.existingId ? <input type="hidden" name="existingId" value={reconciliation.existingId} /> : null}
      {/* What this review showed, for HomeSend's outcome metrics (§19) — never a decision. */}
      {proposal ? <input type="hidden" name="proposal" value={proposal} /> : null}
      <input type="hidden" name="subjectState" value={subject?.question ? "asked" : subject?.selected ? "resolved" : "not_needed"} />
      {routeError ? <Alert>{routeError}</Alert> : null}
      {notice ? (
        <Alert tone="info">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles aria-hidden className="size-3.5" /> {notice}
          </span>
        </Alert>
      ) : null}

      <HomeSendFindings understanding={understanding} contentType={contentType} receivedAt={receivedAt} labels={labels} />

      {/* §12: a low-confidence reading opens with its one question (who it
          is for is asked beside the picker instead); a bill or a health
          document says plainly why it always waits for a person. */}
      {confirmation?.mode === "ask" && confirmation.question && confirmation.question !== subject?.question ? (
        <p className="text-sm font-medium">{confirmation.question}</p>
      ) : null}
      {confirmation?.mode === "govern" ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{confirmation.reason}</p> : null}

      {needs.length > 0 ? (
        // "I found 2 things" (§13): the main item plus what else the same
        // content asked for, each its own decision.
        <p className="text-sm font-medium">{countWords(words.foundThings, needs.length + 1, { list: [primaryLabel, ...needs.map((need) => need.title)].join(", ") })}</p>
      ) : null}

      {reconciliation ? (
        <div className="space-y-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-3">
          <p className="text-sm">
            <span className="block font-medium">
              {proposal === "update"
                ? words.looksUpdate
                : proposal === "cancellation"
                  ? words.looksCancellation
                  : proposal === "conflict"
                    ? words.looksConflict
                    : words.looksDuplicate}
            </span>
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">{reconciliation.message}</span>
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="kind" className="block text-sm font-medium">{words.thisIs}</label>
        <select id="kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value)} className={selectClass}>
          {KIND_VALUES.map((value) => (
            <option key={value} value={value}>{labels.options.kind[value]}</option>
          ))}
        </select>
      </div>

      <HomeSendConfirmFields kind={kind} prefill={prefill} kids={kids} subject={subject ?? null} householdId={householdId} canAddChild={canAddChild} labels={labels} />

      {needs.length > 0 ? (
        <fieldset className="space-y-2 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-3">
          <legend className="px-1 text-sm font-medium">{words.alsoGroceries}</legend>
          {needs.map((need) => (
            <label key={need.title} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="need" value={need.title} className="mt-0.5" />
              <span>
                <span className="block font-medium">{need.title}</span>
                <span className="block text-xs text-[var(--wh-foreground-subtle)]">{need.reason}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {/* One path per decision (rule 14): the proposal decides which buttons there are. */}
      {proposal === "update" || proposal === "cancellation" ? (
        <div className="space-y-2">
          <Button type="submit" name="decision" value={proposal === "update" ? "update" : "cancel"} disabled={busy} className="w-full">
            {proposal === "update" ? words.updateExisting : words.cancelExisting}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button type="submit" name="decision" value="keep" variant="secondary" disabled={busy}>
              {words.keepExisting}
            </Button>
            <Button type="submit" name="confirmDuplicate" value="on" variant="secondary" disabled={busy}>
              {words.addAsNew}
            </Button>
          </div>
        </div>
      ) : proposal ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" name="decision" value="keep" variant="secondary" disabled={busy}>
            {words.keepExisting}
          </Button>
          <Button type="submit" name="confirmDuplicate" value="on" disabled={busy}>
            {words.addAnyway}
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={busy} className="w-full">
          {kind === "receipt" ? words.recordPurchases : words.add}
        </Button>
      )}
    </form>
  );
}

/**
 * Who a school notice is for (story 08-009).
 *
 * A picker of the household's children, with its own way to add one who is
 * not on record yet (rule 20): a notice for a child the household has not
 * added is not a dead end. The name the notice used is filled in; adding
 * follows the Family screen's rule — an Admin adds, and becomes the child's
 * guardian — and the notice is then confirmed for that child in the same
 * step. Someone who may not add a child is told who can, instead of being
 * offered a control that would refuse them.
 */
function SchoolChildField({
  kids,
  subject,
  defaultValue,
  canAddChild,
  labels,
}: {
  kids: { id: string; displayName: string }[];
  subject: ReviewSubject | null;
  defaultValue: string;
  canAddChild: boolean;
  labels: HomeSendReviewLabels["child"];
}) {
  // A notice that named somebody the household does not have starts on
  // "add them"; so does a household with no children at all.
  const namedSomeoneNew = Boolean(subject?.unknown && subject.said);
  const [value, setValue] = useState(canAddChild && (kids.length === 0 || (namedSomeoneNew && !defaultValue)) ? NEW_CHILD : defaultValue);
  const adding = value === NEW_CHILD;
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <label htmlFor="childMemberId" className="block text-sm font-medium">{labels.for}</label>
        {subject?.question && !adding ? <p className="text-sm text-[var(--wh-foreground-muted)]">{subject.question}</p> : null}
        <select id="childMemberId" name="childMemberId" className={selectClass} value={value} onChange={(event) => setValue(event.target.value)} required>
          {kids.length === 0 && !canAddChild ? <option value="">{labels.noChildren}</option> : null}
          {kids.length > 0 && !value ? <option value="">{labels.choose}</option> : null}
          {kids.map((kid) => (
            <option key={kid.id} value={kid.id}>{kid.displayName}</option>
          ))}
          {canAddChild ? <option value={NEW_CHILD}>{subject?.said && namedSomeoneNew ? fillIn(labels.addNamed, { name: subject.said }) : labels.add}</option> : null}
        </select>
        {!canAddChild && (kids.length === 0 || namedSomeoneNew) ? (
          <p className="text-xs text-[var(--wh-foreground-subtle)]">
            {subject?.said ? `${fillIn(labels.notOnRecord, { name: subject.said })} ` : ""}
            {labels.adminCanAdd}
          </p>
        ) : null}
      </div>
      {adding ? (
        <div className="space-y-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-3">
          <Field label={labels.name} name="newChildName" required defaultValue={namedSomeoneNew || kids.length === 0 ? (subject?.said ?? "") : ""} autoComplete="off" />
          <Field label={labels.dob} name="newChildDob" type="date" />
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.joins}</p>
        </div>
      ) : null}
    </div>
  );
}

/** The picker's value for "add a child who is not on record yet". */
const NEW_CHILD = "new";

/**
 * The kind-specific fields, swapped by the `kind` select above it — the
 * parent owns that selection so both controls read the one piece of state.
 */
export function HomeSendConfirmFields({
  kind,
  prefill,
  kids,
  subject = null,
  householdId,
  canAddChild = false,
  labels,
}: {
  kind: string;
  prefill: HomeSendExtractionFields;
  kids: { id: string; displayName: string }[];
  subject?: ReviewSubject | null;
  /** Needed by a receipt, whose lines are matched against what the household tracks. */
  householdId?: string;
  /** Offer adding the child the notice names when they are not on record yet (story 08-009). */
  canAddChild?: boolean;
  labels: HomeSendReviewLabels;
}) {
  if (kind === "receipt" && householdId) return <HomeSendReceiptFields householdId={householdId} prefill={prefill} labels={labels.receipt} />;
  const words = labels.field;
  const options = labels.options;
  // Who it is for: whoever the content named, resolved through the
  // household's own people — or, when that is not clear, nobody until the
  // person chooses (§9: never guess).
  const schoolDefault = subject?.selected?.memberId ?? (subject?.question ? "" : (kids[0]?.id ?? ""));
  const healthDefault = subject?.selected && kids.some((kid) => kid.id === subject.selected?.memberId) ? subject.selected.memberId : "";
  return (
    <>
      <Field label={words.whatIsIt} name="title" required defaultValue={prefill?.title ?? ""} autoComplete="off" />

      {kind === "bill" ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="billKind" className="block text-sm font-medium">{words.billKind}</label>
            <select id="billKind" name="billKind" defaultValue={prefill?.billKind ?? "other"} className={selectClass}>
              {OBLIGATION_KIND_VALUES.map((value) => (
                <option key={value} value={value}>{options.bill[value]}</option>
              ))}
            </select>
          </div>
          <Field label={words.payee} name="payee" defaultValue={prefill?.payee ?? ""} autoComplete="off" />
          <div className="grid grid-cols-2 gap-3">
            <Field label={words.amount} name="amount" type="number" min={0} step="0.01" defaultValue={prefill?.amount ?? ""} />
            <Field label={words.currency} name="currency" defaultValue={prefill?.currency ?? ""} placeholder="INR" autoComplete="off" />
          </div>
          <Field label={words.due} name="dueDate" type="date" defaultValue={prefill?.dueDate ?? ""} />
        </>
      ) : kind === "school_item" ? (
        <>
          <SchoolChildField kids={kids} subject={subject} defaultValue={schoolDefault} canAddChild={canAddChild} labels={labels.child} />
          <div className="space-y-1.5">
            <label htmlFor="schoolKind" className="block text-sm font-medium">{words.schoolKind}</label>
            <select id="schoolKind" name="schoolKind" defaultValue={prefill?.schoolKind ?? "homework"} className={selectClass}>
              {SCHOOL_KIND_VALUES.map((value) => (
                <option key={value} value={value}>{options.school[value]}</option>
              ))}
            </select>
          </div>
          <Field label={words.subject} name="subject" defaultValue={prefill?.subject ?? ""} autoComplete="off" />
          <Field label={words.due} name="dueDate" type="date" defaultValue={prefill?.dueDate ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={words.starts} name="dueTime" type="time" defaultValue={prefill?.dueTime ?? ""} hint={words.startsHint} />
            <Field label={words.ends} name="endTime" type="time" defaultValue={prefill?.endTime ?? ""} />
          </div>
        </>
      ) : kind === "health_document" ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="subjectMemberId" className="block text-sm font-medium">{words.whose}</label>
            {subject?.question ? <p className="text-sm text-[var(--wh-foreground-muted)]">{subject.question}</p> : null}
            <select id="subjectMemberId" name="subjectMemberId" className={selectClass} defaultValue={healthDefault}>
              <option value="">{words.me}</option>
              {kids.map((kid) => (
                <option key={kid.id} value={kid.id}>{kid.displayName}</option>
              ))}
            </select>
            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              {prefill?.subjectMemberName ? `${fillIn(words.readName, { name: prefill.subjectMemberName })} ` : ""}
              {words.whoseHint}
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="healthRecordType" className="block text-sm font-medium">{words.recordType}</label>
            <select id="healthRecordType" name="healthRecordType" defaultValue={prefill?.healthRecordType ?? "other"} className={selectClass}>
              {RECORD_TYPE_VALUES.map((value) => (
                <option key={value} value={value}>{options.record[value]}</option>
              ))}
            </select>
          </div>
          <Field label={words.documentDate} name="documentDate" type="date" defaultValue={prefill?.documentDate ?? ""} />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label={words.quantity} name="quantity" type="number" min={0.01} step="0.01" defaultValue={prefill?.quantity ?? ""} />
          <Field label={words.unit} name="unit" defaultValue={prefill?.unit ?? ""} placeholder={words.unitPlaceholder} autoComplete="off" />
          <div className="col-span-2">
            <Field label={words.category} name="category" defaultValue={prefill?.category ?? ""} placeholder={words.categoryPlaceholder} autoComplete="off" />
          </div>
        </div>
      )}

      <Field label={words.notes} name="notes" defaultValue={prefill?.notes ?? ""} autoComplete="off" />
    </>
  );
}
