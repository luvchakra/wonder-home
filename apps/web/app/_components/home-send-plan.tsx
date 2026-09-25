"use client";

import { CheckCircle2, FileText, GraduationCap, ShoppingBasket, Sparkles, Wallet } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import type { IntakeChangeReceipt, ReceiptAction } from "@wonderhome/core/homesend/apply";
import { RECEIPT_ACTIONS } from "@wonderhome/core/homesend/apply";
import type { PageReport } from "@wonderhome/core/homesend/document";
import { PLAN_GROUPS, type DocumentPlan, type PlanEntry } from "@wonderhome/core/homesend/plan";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { Field } from "@wonderhome/core/ui/field";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge, Pill, type BadgeTone } from "@wonderhome/core/ui/pill";
import { Switch } from "@wonderhome/core/ui/switch";

import { undoHomeSendDocumentAction, type RouteHomeItemState } from "../(auth)/home-send-actions";
import { applyDocumentPlanAction, type ApplyPlanState } from "../(auth)/home-send-plan-actions";
import { countWords, fillIn, type HomeSendReviewLabels } from "../_lib/homesend-labels";

type PlanLabels = HomeSendReviewLabels["plan"];
type AppliedLabels = HomeSendReviewLabels["applied"];

/**
 * The document change plan, reviewed (Deep Document Understanding 2.0
 * §22–24, §36–37; the "Found 4 items" mockup).
 *
 * Every record the document proposes is one row — an icon tile, its name,
 * one line of why, and its outcome in words — grouped the way a person
 * decides: what changes, what is new, what is already on record, what is
 * newer on record, what needs an answer. Each row opens (the one chevron,
 * rule 21) to exactly what would be written, before → after, and the page
 * it was read from. Nothing is written until "Review and apply"; what the
 * browser sends is only the person's choices, and the server rebuilds the
 * plan before it writes anything.
 */

const DOMAIN: Record<PlanEntry["domain"], { icon: typeof Wallet; tone: IconTone }> = {
  school_item: { icon: GraduationCap, tone: "school" },
  bill: { icon: Wallet, tone: "money" },
  grocery_item: { icon: ShoppingBasket, tone: "care" },
};

/** Each outcome's tone; its words are `labels.outcome`, by the same closed value. */
const OUTCOME_TONE: Record<PlanEntry["action"], BadgeTone> = {
  create: "handled",
  update: "school",
  cancel: "attention",
  no_change: "neutral",
  conflict: "attention",
  needs_answer: "attention",
};

/** A plan field's name in the viewer's language — the plan keeps its own English label as the fallback. */
function fieldLabel(field: { field: string; label: string }, domain: PlanEntry["domain"], labels: PlanLabels): string {
  if (field.field === "date") return domain === "bill" ? labels.due : labels.date;
  if (field.field === "person") return domain === "school_item" ? labels.fieldChild : labels.field.person!;
  return labels.field[field.field] ?? field.label;
}

/** What changes on an update: the date (a bill's due date) or the amount. */
function changeLabel(change: { field: string; label: string }, domain: PlanEntry["domain"], labels: PlanLabels): string {
  if (change.field === "date") return domain === "bill" ? labels.fieldDueDate : labels.date;
  if (change.field === "amount") return labels.amount;
  return change.label;
}

/** "All 3 pages read", or which pages could not be made out (`pagesReadLine`, in the viewer's language). */
function pagesLine(pages: PageReport, labels: PlanLabels): string | null {
  if (pages.total === null || pages.read === null || pages.total <= 1) return pages.total === 1 && pages.unreadable.length === 1 ? labels.pageUnreadable : null;
  if (pages.read === pages.total) return fillIn(labels.allPagesRead, { total: pages.total });
  const which = pages.unreadable.length === 1 ? fillIn(labels.page, { page: pages.unreadable[0]! }) : fillIn(labels.pages, { pages: pages.unreadable.join(", ") });
  return fillIn(labels.somePagesRead, { read: pages.read, total: pages.total, which });
}

/** The receipt's headline (`receiptHeadline`, in the viewer's language). */
function headline(receipt: IntakeChangeReceipt, labels: AppliedLabels): string {
  const written = receipt.counts.created + receipt.counts.updated + receipt.counts.cancelled;
  switch (receipt.status) {
    case "no_change":
      return labels.nothingNew;
    case "failed":
      return labels.nothingApplied;
    case "partial":
      return fillIn(labels.partialHeadline, { applied: written, failed: receipt.counts.failed });
    case "needs_review":
      return labels.waiting;
    default: {
      const applied = countWords(labels.changes, written);
      // Done, but not everything: a question left unanswered is said, never folded into "all done".
      return receipt.counts.needs_clarification > 0 ? fillIn(labels.withWaiting, { applied, waiting: receipt.counts.needs_clarification }) : applied;
    }
  }
}

const writes = (entry: PlanEntry) => entry.action === "create" || entry.action === "update" || entry.action === "cancel";

function Source({ evidence, labels }: { evidence: PlanEntry["evidence"]; labels: PlanLabels }) {
  const where = [evidence.page ? fillIn(labels.sourcePage, { page: evidence.page }) : null, evidence.section].filter(Boolean).join(" · ");
  if (!where && !evidence.quote) return null;
  return (
    <div className="flex gap-2.5 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-2.5">
      <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
      <div className="min-w-0 text-xs">
        <p className="font-medium">{where ? fillIn(labels.sourceWhere, { where }) : labels.source}</p>
        {evidence.quote ? <p className="mt-0.5 break-words text-[var(--wh-foreground-muted)]">&ldquo;{evidence.quote}&rdquo;</p> : null}
      </div>
    </div>
  );
}

function EntryDetail({
  entry,
  included,
  onInclude,
  answer,
  onAnswer,
  editing,
  onEdit,
  labels,
}: {
  labels: PlanLabels;
  entry: PlanEntry;
  included: boolean;
  onInclude: (value: boolean) => void;
  answer: string | undefined;
  onAnswer: (memberId: string) => void;
  editing: boolean;
  onEdit: () => void;
}) {
  const household = entry.fields.filter((field) => field.source === "household");
  return (
    <div className="space-y-3 sm:pl-[3.25rem]">
      {entry.changes.length > 0 ? (
        <dl className="space-y-1.5 text-sm">
          {entry.changes.map((change) => (
            <div key={change.field} className="flex flex-wrap items-baseline gap-x-2">
              <dt className="w-20 shrink-0 text-[var(--wh-foreground-muted)]">{changeLabel(change, entry.domain, labels)}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[var(--wh-foreground-subtle)] line-through">{change.before ?? "—"}</span>
                <span aria-hidden>→</span>
                <span className="sr-only">{labels.changesTo}</span>
                <span className="font-semibold">{change.after}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <dl className="space-y-1.5 text-sm">
        {entry.fields
          // What an update changes is shown once, as before → after, above.
          .filter((field) => field.source === "document" && !entry.changes.some((change) => change.field === field.field))
          .map((field) => (
            <div key={field.field} className="flex flex-wrap gap-x-2">
              <dt className="w-20 shrink-0 text-[var(--wh-foreground-muted)]">{fieldLabel(field, entry.domain, labels)}</dt>
              <dd className="min-w-0 flex-1 break-words">{field.value}</dd>
            </div>
          ))}
      </dl>

      {household.length > 0 ? (
        <div className="text-sm">
          <p className="text-xs font-medium text-[var(--wh-foreground-muted)]">{labels.fromHousehold}</p>
          <dl className="mt-1 space-y-1.5">
            {household.map((field) => (
              <div key={field.field} className="flex flex-wrap gap-x-2">
                <dt className="w-20 shrink-0 text-[var(--wh-foreground-muted)]">{fieldLabel(field, entry.domain, labels)}</dt>
                <dd className="min-w-0 flex-1 break-words">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {entry.existing && entry.action !== "update" ? (
        <p className="text-xs text-[var(--wh-foreground-muted)]">{fillIn(labels.onRecord, { title: entry.existing.title })}</p>
      ) : null}

      <Source evidence={entry.evidence} labels={labels} />

      {entry.question ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{entry.question.text}</legend>
          {entry.question.options.map((option) => (
            <label key={option.memberId} className="flex min-h-11 items-center gap-2.5 text-sm">
              <input type="radio" name={`choice.${entry.key}`} value={option.memberId} checked={answer === option.memberId} onChange={() => onAnswer(option.memberId)} className="size-4 accent-[var(--wh-primary)]" />
              {option.displayName}
            </label>
          ))}
          <label className="flex min-h-11 items-center gap-2.5 text-sm">
            <input type="radio" name={`choice.${entry.key}`} value="" checked={!answer} onChange={() => onAnswer("")} className="size-4 accent-[var(--wh-primary)]" />
            {labels.notSure}
          </label>
        </fieldset>
      ) : null}

      {writes(entry) ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2.5 text-sm">
            <Switch checked={included} onCheckedChange={onInclude} label={fillIn(labels.include, { title: entry.title })} />
            {included ? labels.included : labels.leftOut}
          </label>
          {entry.action === "create" ? (
            <Pill type="button" tone="quiet" onClick={onEdit} aria-expanded={editing}>
              {editing ? labels.doneEditing : labels.edit}
            </Pill>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type Edit = { title?: string; date?: string; amount?: string };

/** A person's correction to one record (§37 "Edit"), kept in state so it survives the row closing. */
function EditFields({ entry, edit, onChange, labels }: { entry: PlanEntry; edit: Edit; onChange: (edit: Edit) => void; labels: PlanLabels }) {
  return (
    <div className="space-y-3 sm:pl-[3.25rem]">
      <Field label={labels.name} name={`draft-${entry.key}-title`} value={edit.title ?? entry.record.title} onChange={(event) => onChange({ ...edit, title: event.target.value })} required maxLength={160} />
      {entry.domain !== "grocery_item" ? (
        <Field label={entry.domain === "bill" ? labels.due : labels.date} name={`draft-${entry.key}-date`} type="date" value={edit.date ?? entry.record.date ?? ""} onChange={(event) => onChange({ ...edit, date: event.target.value })} />
      ) : null}
      {entry.domain === "bill" ? (
        <Field
          label={labels.amount}
          name={`draft-${entry.key}-amount`}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={edit.amount ?? (entry.record.amount === null ? "" : String(entry.record.amount))}
          onChange={(event) => onChange({ ...edit, amount: event.target.value })}
        />
      ) : null}
    </div>
  );
}

/** Each receipt outcome's tone; its words are `labels.action`, by the same closed value. */
const RECEIPT_TONE: Record<ReceiptAction, BadgeTone> = {
  updated: "school",
  cancelled: "attention",
  created: "handled",
  unchanged: "neutral",
  skipped: "neutral",
  needs_clarification: "attention",
  failed: "risk",
};

/** What applying did, record by record (§24, §43) — the "All done!" screen, or honestly less. */
export function DocumentReceipt({
  receipt,
  householdId,
  onDone,
  labels,
}: {
  receipt: IntakeChangeReceipt;
  householdId: string;
  onDone?: () => void;
  labels: HomeSendReviewLabels;
}) {
  const words = labels.applied;
  const [undoState, undoAction, undoing] = useActionState<RouteHomeItemState, FormData>(undoHomeSendDocumentAction, {});
  const written = receipt.counts.created + receipt.counts.updated + receipt.counts.cancelled;
  const done = receipt.status === "completed" || receipt.status === "no_change";
  const ordered = RECEIPT_ACTIONS.flatMap((action) => receipt.changes.filter((change) => change.action === action));
  return (
    <div className="space-y-4" role="status">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <CheckCircle2 aria-hidden className={done ? "size-12 text-[var(--wh-handled)]" : "size-12 text-[var(--wh-attention)]"} />
        <h3 className="text-lg font-semibold">{receipt.status === "completed" && receipt.counts.needs_clarification === 0 ? words.allDone : headline(receipt, words)}</h3>
        <p className="text-sm text-[var(--wh-foreground-muted)]">
          {receipt.status === "no_change"
            ? words.noChange
            : receipt.status === "completed"
              ? countWords(words.completed, written)
              : receipt.status === "partial"
                ? words.partial
                : receipt.status === "needs_review"
                  ? words.needsReview
                  : words.none}
        </p>
      </div>
      {undoState.notice ? <Alert tone="info">{undoState.notice}</Alert> : null}
      {undoState.error ? <Alert>{undoState.error}</Alert> : null}
      <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] border border-[var(--wh-border)]">
        {ordered.map((change) => {
          const domain = DOMAIN[change.domain];
          const tone = RECEIPT_TONE[change.action];
          return (
            <li key={change.key} className="flex gap-3 p-3">
              <IconTile icon={domain.icon} tone={domain.tone} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="break-words">{change.title}</span>
                  <Badge tone={tone}>{words.action[change.action]}</Badge>
                </p>
                <p className="mt-0.5 break-words text-xs text-[var(--wh-foreground-muted)]">{change.error ?? change.reason}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        {written > 0 && !undoState.notice ? (
          <form action={undoAction} className="sm:flex-1">
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="itemId" value={receipt.intakeId} />
            <Button type="submit" variant="secondary" disabled={undoing} className="w-full">
              {undoing ? labels.undoing : countWords(words.undo, written)}
            </Button>
          </form>
        ) : null}
        {onDone ? (
          <Button type="button" onClick={onDone} className="w-full sm:flex-1">
            {words.done}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentPlanReview({
  householdId,
  itemId,
  plan,
  summary,
  onDone,
  onApplied,
  labels,
}: {
  labels: HomeSendReviewLabels;
  householdId: string;
  itemId: string;
  plan: DocumentPlan;
  /** What the document is, in one sentence. */
  summary?: string | null;
  onDone?: () => void;
  onApplied?: () => void;
}) {
  const [state, action, applying] = useActionState<ApplyPlanState, FormData>(applyDocumentPlanAction, {});
  // Said once, when the receipt first appears — never on every render.
  const receiptShown = Boolean(state.receipt);
  const applied = useRef(onApplied);
  useEffect(() => {
    applied.current = onApplied;
  });
  useEffect(() => {
    if (receiptShown) applied.current?.();
  }, [receiptShown]);
  const [included, setIncluded] = useState<Set<string>>(() => new Set(plan.entries.filter((entry) => entry.included).map((entry) => entry.key)));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, Edit>>({});

  if (state.receipt) {
    return (
      <div className="space-y-3">
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
        <DocumentReceipt receipt={state.receipt} householdId={householdId} onDone={onDone} labels={labels} />
      </div>
    );
  }

  const answered = plan.entries.filter((entry) => entry.action === "needs_answer" && answers[entry.key]);
  const count = plan.entries.filter((entry) => writes(entry) && included.has(entry.key)).length + answered.length;
  const words = labels.plan;
  const pages = pagesLine(plan.pages, words);
  const toggle = (set: Set<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={itemId} />
      {[...included].map((key) => (
        <input key={key} type="hidden" name="include" value={key} />
      ))}
      {Object.entries(edits).flatMap(([key, edit]) =>
        Object.entries(edit).map(([field, value]) => <input key={`${key}.${field}`} type="hidden" name={`edit.${key}.${field}`} value={value} />),
      )}
      {answered.map((entry) => (
        <span key={entry.key}>
          <input type="hidden" name="include" value={entry.key} />
          <input type="hidden" name={`answer.${entry.key}`} value={answers[entry.key]} />
        </span>
      ))}

      <div className="flex gap-3">
        <IconTile icon={Sparkles} tone="ai" size="lg" />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{countWords(words.found, plan.entries.length)}</h3>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {summary ? `${summary} ` : ""}
            {words.lede}
          </p>
          {pages ? <p className="mt-0.5 text-xs text-[var(--wh-foreground-subtle)]">{pages}</p> : null}
        </div>
      </div>

      {PLAN_GROUPS.map((group) => {
        const entries = plan.entries.filter((entry) => entry.group === group);
        if (entries.length === 0) return null;
        return (
          <section key={group} aria-label={words.group[group]}>
            <h4 className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-[var(--wh-foreground-muted)] uppercase">
              {words.group[group]} <span className="font-normal">{entries.length}</span>
            </h4>
            <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)]">
              {entries.map((entry) => {
                const domain = DOMAIN[entry.domain];
                const outcome = writes(entry) && !included.has(entry.key) ? { label: words.leftOut, tone: "neutral" as const } : { label: words.outcome[entry.action], tone: OUTCOME_TONE[entry.action] };
                return (
                  <ExpandableRow
                    key={entry.key}
                    summary={
                      <>
                        <IconTile icon={domain.icon} tone={domain.tone} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-medium break-words">{entry.title}</span>
                            <Badge tone={outcome.tone}>{outcome.label}</Badge>
                          </span>
                          <span className="mt-0.5 block text-xs break-words text-[var(--wh-foreground-muted)]">{entry.reason}</span>
                        </span>
                      </>
                    }
                  >
                    <EntryDetail
                      labels={words}
                      entry={entry}
                      included={included.has(entry.key)}
                      onInclude={(on) => setIncluded((current) => toggle(current, entry.key, on))}
                      answer={answers[entry.key]}
                      onAnswer={(memberId) => setAnswers((current) => ({ ...current, [entry.key]: memberId }))}
                      editing={editing.has(entry.key)}
                      onEdit={() => setEditing((current) => toggle(current, entry.key, !current.has(entry.key)))}
                    />
                    {editing.has(entry.key) ? <EditFields labels={words} entry={entry} edit={edits[entry.key] ?? {}} onChange={(edit) => setEdits((current) => ({ ...current, [entry.key]: edit }))} /> : null}
                  </ExpandableRow>
                );
              })}
            </ul>
          </section>
        );
      })}

      {state.error ? <Alert>{state.error}</Alert> : null}
      <Button type="submit" disabled={applying} className="w-full">
        {applying ? words.applying : count > 0 ? fillIn(words.apply, { count }) : words.nothingToChange}
      </Button>
    </form>
  );
}
