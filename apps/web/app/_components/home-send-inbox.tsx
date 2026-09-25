"use client";

import { Camera, ClipboardPaste, GraduationCap, HeartPulse, HelpCircle, Link2, Mic, PenLine, Receipt, ShieldAlert, ShoppingBasket, UploadCloud, Wallet, X } from "lucide-react";
import { useActionState, useRef, useState, type ReactNode } from "react";

import { gateTranscript } from "@wonderhome/core/homesend/audio";
import type { HomeSendChange } from "@wonderhome/core/homesend/items";
import { ACCEPTED_UPLOAD_TYPES } from "@wonderhome/core/homesend/normalize";
import type { DocumentPlan } from "@wonderhome/core/homesend/plan";
import type { IntakeUnderstanding } from "@wonderhome/core/homesend/understanding";
import { cn } from "@wonderhome/core/lib/cn";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge, Pill } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import {
  confirmTranscriptAction,
  dismissHomeSendItemAction,
  pasteHomeSendItemAction,
  routeHomeSendItemAction,
  undoHomeSendChangeAction,
  uploadHomeSendItemAction,
  type HomeSendItem,
  type RouteHomeItemState,
  type SendHomeItemState,
} from "../(auth)/home-send-actions";
import { fillIn, type HomeSendPageLabels, type HomeSendSourceLabels } from "../_lib/homesend-labels";
import { describeSource, HomeSendConfirmStep, TranscriptCheck, type ReviewConfirmation, type ReviewReconciliation, type ReviewSubject } from "./home-send-intake";

/** What the server prepared for an item already waiting (`home-send-review.ts`): who it is for, and whether it is already on record. */
export type PreparedReview = { subject: ReviewSubject | null; reconciliation: ReviewReconciliation | null; confirmation?: ReviewConfirmation | null; plan?: DocumentPlan | null };

const KIND_PRESENTATION: Record<string, { icon: typeof Wallet; tone: IconTone }> = {
  bill: { icon: Wallet, tone: "money" },
  school_item: { icon: GraduationCap, tone: "school" },
  grocery_item: { icon: ShoppingBasket, tone: "care" },
  health_document: { icon: HeartPulse, tone: "health" },
  receipt: { icon: Receipt, tone: "care" },
  unknown: { icon: HelpCircle, tone: "neutral" },
};

/** A kind's tile and its word, in the viewer's language (`labels.kind`, by the same closed value). */
function presentationFor(kind: string | null, words: Record<string, string>): { icon: typeof Wallet; tone: IconTone; label: string } {
  const key = kind && KIND_PRESENTATION[kind] ? kind : "unknown";
  return { ...KIND_PRESENTATION[key]!, label: words[key] ?? words.unknown ?? "" };
}

/**
 * The opening of a pasted message, ended where a sentence ends rather than
 * mid-word (rule 15): the full message is one tap away in the review step.
 */
function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  if (end > 0 && end < 160) return flat.slice(0, end + 1);
  if (flat.length <= 160) return flat;
  const cut = flat.slice(0, 160);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : 160)}…`;
}

/** A row's name: what was read, else what it is — never an empty line. */
function titleFor(item: HomeSendItem, words: HomeSendSourceLabels): string {
  if (item.extracted?.title) return item.extracted.title;
  if (item.understanding?.contentSummary) return item.understanding.contentSummary;
  if (item.subject) return item.subject;
  if (item.sourceUrl) return item.sourceUrl;
  if (item.rawText) return firstSentence(item.rawText);
  return describeSource(item.understanding ?? { provenance: { channel: item.source, transcriptConfidence: null, url: null, subject: null, sender: null, filename: null } }, { contentType: item.contentType }, words);
}

/**
 * A voice note still waiting for the household to check what was heard (§17).
 * Its prompt is written by `TranscriptCheck`, in the viewer's language.
 */
function uncheckedTranscript(item: HomeSendItem): { text: string; prompt: string } | null {
  if (item.source !== "audio_note" || item.classifiedKind !== "unknown" || !item.rawText || item.transcriptConfidence === null) return null;
  const gate = gateTranscript({ text: item.rawText, confidence: item.transcriptConfidence });
  return gate.outcome === "uncertain" ? { text: gate.text, prompt: "" } : null;
}

type OpenItem = {
  id: string;
  mode: "confirm" | "transcript";
  classifiedKind: string;
  extracted: HomeSendItem["extracted"];
  understanding?: IntakeUnderstanding | null;
  reconciliation?: ReviewReconciliation | null;
  subject?: ReviewSubject | null;
  contentType?: string | null;
  receivedAt?: string | null;
  heard?: { text: string; prompt: string } | null;
  notice?: string | null;
  confirmation?: ReviewConfirmation | null;
  plan?: DocumentPlan | null;
};

function openFromState(state: SendHomeItemState): OpenItem | null {
  if (!state.item || state.state === "failed") return null;
  return {
    id: state.item.id,
    mode: state.state === "check_transcript" ? "transcript" : "confirm",
    classifiedKind: state.item.classifiedKind,
    extracted: state.item.extracted,
    understanding: state.item.understanding ?? null,
    reconciliation: state.item.reconciliation ?? null,
    subject: state.item.subject ?? null,
    confirmation: state.item.confirmation ?? null,
    plan: state.item.plan ?? null,
    receivedAt: new Date().toISOString(),
    heard: state.heard ?? null,
    notice: state.notice ?? null,
  };
}

/**
 * HomeSend's own screen: a drop zone (plus click-to-browse, since drag has
 * no equivalent on a phone) and a paste box for a message or a link feed the
 * one pipeline; the inbox below keeps what is waiting on a person, what
 * failed safely, and what was already handled (Wave 3 §14) — none of it is
 * lost by closing the page.
 */
export function HomeSendInbox({
  householdId,
  kids,
  pending,
  failed,
  history,
  changes,
  reviews = {},
  groceryNames = {},
  purchaseNames = {},
  canAddChild = false,
  senders = {},
  filterLabel = null,
  filter = null,
  labels,
}: {
  /** The screen's words in the viewer's language (`homesendPageLabels`). */
  labels: HomeSendPageLabels;
  householdId: string;
  kids: { id: string; displayName: string }[];
  /** Whether the viewer may add a child from a school notice (story 08-009). */
  canAddChild?: boolean;
  pending: HomeSendItem[];
  failed: HomeSendItem[];
  /** Prepared server-side for items already waiting, by item id. */
  reviews?: Record<string, PreparedReview>;
  history: HomeSendItem[];
  changes: HomeSendChange[];
  /** Consumable names by id, for the "Also added to Groceries" lines. */
  groceryNames?: Record<string, string>;
  /** A receipt's recorded lines by purchase id ("Milk × 2") — undone ones have no label. */
  purchaseNames?: Record<string, string>;
  /** Members' names by id, so a WhatsApp item says who sent it (story 14-016). */
  senders?: Record<string, string>;
  /** Set when the lists below are one channel's only ("WhatsApp"), for the empty state. */
  filterLabel?: string | null;
  /** The channel tabs, placed between the drop zone and the lists they filter. */
  filter?: ReactNode;
}) {
  const [uploadState, uploadAction, uploading] = useActionState<SendHomeItemState, FormData>(uploadHomeSendItemAction, {});
  const [pasteState, pasteAction, pasting] = useActionState<SendHomeItemState, FormData>(pasteHomeSendItemAction, {});
  const [transcriptState, transcriptAction, confirmingTranscript] = useActionState<SendHomeItemState, FormData>(confirmTranscriptAction, {});
  const [routeState, routeAction, routing] = useActionState<RouteHomeItemState, FormData>(routeHomeSendItemAction, {});
  const [dismissState, dismissAction, dismissing] = useActionState<RouteHomeItemState, FormData>(dismissHomeSendItemAction, {});
  const [undoState, undoAction, undoing] = useActionState<RouteHomeItemState, FormData>(undoHomeSendChangeAction, {});

  const [mode, setMode] = useState<"drop" | "paste">("drop");
  const [dragOver, setDragOver] = useState(false);
  const [openItem, setOpenItem] = useState<OpenItem | null>(null);
  const [planApplied, setPlanApplied] = useState(false);
  const [failedNotice, setFailedNotice] = useState<string | null>(null);
  // Applied on its own under the household's own autonomy setting (§12):
  // said so, with its Undo right here as well as in "Recently handled".
  const [autoApplied, setAutoApplied] = useState<{ notice: string; changeId: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const busy = uploading || pasting;
  const words = labels.inbox;
  const review = labels.review;

  // Each action's state object is a stable reference until its next submit,
  // so comparing against the last one this render loop saw catches exactly
  // one transition per result — adjusted during render, not in an effect.
  const [seen, setSeen] = useState([uploadState, pasteState, transcriptState]);
  const fresh = [uploadState, pasteState, transcriptState].find((state, index) => state !== seen[index]);
  if (fresh) {
    setSeen([uploadState, pasteState, transcriptState]);
    setAutoApplied(fresh.autoApplied ? { notice: fresh.notice ?? "", changeId: fresh.autoApplied.changeId, title: fresh.autoApplied.title } : null);
    if (fresh.state === "failed") {
      setFailedNotice(fresh.notice ?? null);
      setOpenItem(null);
    } else {
      const next = openFromState(fresh);
      if (next) {
        setFailedNotice(null);
        setOpenItem(next);
      }
    }
  }

  // Routing or dismissing closes the confirm step and clears the drop zone
  // back to its resting state, same as `HomeSendSheet` closing itself.
  const closedNotice = routeState.notice ?? dismissState.notice ?? undoState.notice ?? null;
  const [seenClosedNotice, setSeenClosedNotice] = useState(closedNotice);
  if (closedNotice !== seenClosedNotice) {
    setSeenClosedNotice(closedNotice);
    if (closedNotice) {
      setOpenItem(null);
      setMode("drop");
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file || !fileInputRef.current || !uploadFormRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInputRef.current.files = transfer.files;
    uploadFormRef.current.requestSubmit();
  }

  function openReview(item: HomeSendItem, handFill = false) {
    const heard = handFill ? null : uncheckedTranscript(item);
    setFailedNotice(null);
    setOpenItem({
      id: item.id,
      mode: heard ? "transcript" : "confirm",
      classifiedKind: item.classifiedKind ?? "unknown",
      extracted: item.extracted,
      understanding: item.understanding,
      contentType: item.contentType,
      receivedAt: item.createdAt,
      heard,
      reconciliation: handFill ? null : (reviews[item.id]?.reconciliation ?? null),
      subject: handFill ? null : (reviews[item.id]?.subject ?? null),
      confirmation: handFill ? null : (reviews[item.id]?.confirmation ?? null),
      plan: handFill ? null : (reviews[item.id]?.plan ?? null),
    });
  }

  const prefill = openItem?.extracted ?? null;
  const defaultKind = openItem?.classifiedKind && openItem.classifiedKind !== "unknown" ? openItem.classifiedKind : "grocery_item";
  const pendingOthers = pending.filter((item) => item.id !== openItem?.id);
  const failedOthers = failed.filter((item) => item.id !== openItem?.id);
  const changesByIntakeId = new Map<string, HomeSendChange[]>();
  for (const change of changes) {
    const list = changesByIntakeId.get(change.intakeId) ?? [];
    list.push(change);
    changesByIntakeId.set(change.intakeId, list);
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4">
        {!openItem ? (
          <>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "rounded-[var(--wh-radius)] border-2 border-dashed p-6 text-center transition-colors motion-reduce:transition-none",
                dragOver ? "border-[var(--wh-primary)] bg-[var(--wh-primary-soft)]/40" : "border-[var(--wh-border)]",
              )}
            >
              <UploadCloud aria-hidden className="mx-auto mb-2 size-8 text-[var(--wh-foreground-subtle)]" />
              <p className="text-sm font-medium">{words.dropTitle}</p>
              <p className="mt-0.5 text-xs text-[var(--wh-foreground-subtle)]">{words.dropHint}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Pill type="button" tone="soft" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  <Camera aria-hidden className="size-3.5" /> {uploading ? review.reading : words.chooseFile}
                </Pill>
                <Pill type="button" tone="quiet" onClick={() => setMode(mode === "paste" ? "drop" : "paste")} disabled={busy}>
                  <ClipboardPaste aria-hidden className="size-3.5" /> {words.paste}
                </Pill>
              </div>
            </div>
            <form ref={uploadFormRef} action={uploadAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <input
                ref={fileInputRef}
                type="file"
                name="photo"
                accept={ACCEPTED_UPLOAD_TYPES}
                className="sr-only"
                onChange={() => uploadFormRef.current?.requestSubmit()}
              />
            </form>
            {uploadState.error ? <Alert>{uploadState.error}</Alert> : null}
            {failedNotice ? <Alert>{failedNotice} {words.keptBelow}</Alert> : null}
            {autoApplied ? (
              <Alert tone="info">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words">{autoApplied.notice}</span>
                  <form action={undoAction}>
                    <input type="hidden" name="householdId" value={householdId} />
                    <input type="hidden" name="changeId" value={autoApplied.changeId} />
                    <Pill type="submit" tone="quiet" disabled={undoing} aria-label={fillIn(words.undoAdding, { title: autoApplied.title })}>
                      {undoing ? review.undoing : words.undo}
                    </Pill>
                  </form>
                </span>
              </Alert>
            ) : null}

            {mode === "paste" ? (
              <form action={pasteAction} className="space-y-3">
                <input type="hidden" name="householdId" value={householdId} />
                {pasteState.error ? <Alert>{pasteState.error}</Alert> : null}
                <label htmlFor="home-send-text" className="block text-sm font-medium">{words.pasteLabel}</label>
                <textarea
                  id="home-send-text"
                  name="text"
                  rows={5}
                  required
                  placeholder={words.pastePlaceholder}
                  className="block w-full resize-none rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
                />
                <Pill type="submit" tone="primary" disabled={busy} className="w-full justify-center">
                  {pasting ? review.reading : review.readThis}
                </Pill>
              </form>
            ) : null}
          </>
        ) : openItem.mode === "transcript" && openItem.heard ? (
          <div className="space-y-3">
            <TranscriptCheck
              key={openItem.id}
              householdId={householdId}
              itemId={openItem.id}
              heard={openItem.heard}
              action={transcriptAction}
              error={transcriptState.error}
              busy={confirmingTranscript}
              labels={review}
            />
            <form action={dismissAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <input type="hidden" name="itemId" value={openItem.id} />
              <Pill type="submit" tone="quiet" disabled={confirmingTranscript || dismissing} className="w-full justify-center">
                {dismissing ? review.dismissing : review.notWorthAdding}
              </Pill>
            </form>
          </div>
        ) : (
          <div className="space-y-3">
            <HomeSendConfirmStep
              key={openItem.id}
              item={openItem}
              defaultKind={defaultKind}
              prefill={prefill}
              kids={kids}
              canAddChild={canAddChild}
              householdId={householdId}
              routeAction={routeAction}
              routeError={routeState.error}
              notice={openItem.notice ?? undefined}
              reconciliation={routeState.reconciliation ?? openItem.reconciliation ?? null}
              busy={routing || dismissing}
              understanding={openItem.understanding}
              contentType={openItem.contentType}
              receivedAt={openItem.receivedAt}
              subject={openItem.subject ?? null}
              confirmation={openItem.confirmation ?? null}
              plan={openItem.plan ?? null}
              labels={review}
              onApplied={() => setPlanApplied(true)}
              onDone={() => {
                setPlanApplied(false);
                setOpenItem(null);
              }}
            />
            {planApplied ? null : (
            <form action={dismissAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <input type="hidden" name="itemId" value={openItem.id} />
              <Pill type="submit" tone="quiet" disabled={routing || dismissing} className="w-full justify-center">
                {dismissing ? review.dismissing : review.notWorthAdding}
              </Pill>
            </form>
            )}
            {dismissState.error ? <Alert>{dismissState.error}</Alert> : null}
          </div>
        )}
      </Card>

      {filter}

      {pendingOthers.length > 0 ? (
        <section>
          <SectionHeader title={words.needsReview} count={pendingOthers.length} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {pendingOthers.map((item) => {
                const heard = uncheckedTranscript(item);
                const presentation = item.source === "audio_note" && heard ? { icon: Mic, tone: "neutral" as IconTone, label: words.voiceNote } : presentationFor(item.classifiedKind, words.kind);
                const reason = heard
                  ? words.checkHeard
                  : describeSource(item.understanding, { contentType: item.contentType, receivedAt: item.createdAt, from: item.createdByMemberId ? senders[item.createdByMemberId] : null }, review.source);
                const title = titleFor(item, review.source);
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words">{title}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{presentation.label} · {reason}</span>
                    </span>
                    <Pill type="button" tone="soft" onClick={() => openReview(item)} aria-label={fillIn(words.reviewAria, { title })}>
                      {words.review}
                    </Pill>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}

      {failedOthers.length > 0 ? (
        <section>
          <SectionHeader title={words.failedSafely} count={failedOthers.length} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {failedOthers.map((item) => {
                const title = titleFor(item, review.source);
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <IconTile icon={item.source === "link" ? Link2 : ShieldAlert} tone="neutral" size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words">{title}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{item.failureReason ? (words.failure[item.failureReason] ?? words.couldNotRead) : words.couldNotRead}</span>
                    </span>
                    <Pill type="button" tone="quiet" onClick={() => openReview(item, true)} aria-label={fillIn(words.fillByHandAria, { title })} title={words.fillByHand}>
                      <PenLine aria-hidden className="size-3.5" />
                    </Pill>
                    <form action={dismissAction}>
                      <input type="hidden" name="householdId" value={householdId} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <Pill type="submit" tone="quiet" disabled={dismissing} aria-label={fillIn(words.dismissAria, { title })} title={words.dismiss}>
                        <X aria-hidden className="size-3.5" />
                      </Pill>
                    </form>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}

      {history.length > 0 ? (
        <section>
          <SectionHeader title={words.recentlyHandled} count={history.length} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {history.map((item) => {
                const title = titleFor(item, review.source);
                const itemChanges = changesByIntakeId.get(item.id) ?? [];
                // A receipt has no one "primary" record: each line it recorded
                // (and each item it started tracking) is its own row with its
                // own Undo (09-009).
                const isReceipt = item.classifiedKind === "receipt" || itemChanges.some((change) => change.domain === "purchase");
                const primaryChange = isReceipt ? undefined : (itemChanges.find((change) => change.domain === item.classifiedKind) ?? itemChanges[0]);
                const secondaryChanges = itemChanges.filter((change) => change !== primaryChange);
                // What was actually routed is more trustworthy than
                // classified_kind — a manual override in the confirm form
                // (or no AI provider ever having classified it at all) can
                // leave classified_kind unknown while the real change row
                // still says exactly what was written.
                const presentation = presentationFor(isReceipt ? "receipt" : (primaryChange?.domain ?? item.classifiedKind), words.kind);
                const canUndoPrimary = Boolean(primaryChange && !primaryChange.undoneAt);
                // A closed status, shown in the viewer's language; the stored values never change.
                const status: keyof typeof words.status =
                  item.status === "dismissed"
                    ? item.reviewDecision === "kept_existing"
                      ? "keptExisting"
                      : "dismissed"
                    : isReceipt
                      ? itemChanges.length > 0 && itemChanges.every((change) => change.undoneAt)
                        ? "undone"
                        : "recorded"
                      : primaryChange?.undoneAt
                        ? "undone"
                      : primaryChange?.changeType === "updated"
                        ? "updated"
                        : primaryChange?.changeType === "cancelled"
                          ? "cancelled"
                          : "added";
                const statusLabel = words.status[status];
                const onRecord =
                  status === "updated" ? words.updatedOnRecord : status === "cancelled" ? words.cancelledOnRecord : statusLabel;
                return (
                  <li key={item.id} className="space-y-1.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium break-words">{title}</span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                          {presentation.label}
                          {primaryChange && primaryChange.changeType !== "created" && !primaryChange.undoneAt ? ` · ${onRecord}` : ""}
                          {item.reviewDecision === "auto_added" && !primaryChange?.undoneAt ? ` · ${words.addedOnItsOwn}` : ""}
                        </span>
                      </span>
                      {canUndoPrimary ? (
                        <form action={undoAction}>
                          <input type="hidden" name="householdId" value={householdId} />
                          <input type="hidden" name="changeId" value={primaryChange!.id} />
                          <Pill
                            type="submit"
                            tone="quiet"
                            disabled={undoing}
                            aria-label={fillIn(status === "added" ? words.undoAdding : status === "updated" ? words.undoUpdating : words.undoCancelling, { title })}
                          >
                            {undoing ? review.undoing : words.undo}
                          </Pill>
                        </form>
                      ) : (
                        <Badge tone={status === "added" || status === "recorded" ? "handled" : "neutral"}>{statusLabel}</Badge>
                      )}
                    </div>
                    {secondaryChanges.map((change) => {
                      const bought = change.domain === "purchase";
                      // A document's plan (DDU 2.0) says what each of its changes was, by name.
                      const planned = item.receipt?.changes.find((entry) => entry.changeId === change.id);
                      const name = planned?.title ?? (bought ? purchaseNames[change.entityId] : groceryNames[change.entityId]);
                      const said = planned
                        ? fillIn(words.planned, {
                            action: planned.action === "updated" ? words.status.updated : planned.action === "cancelled" ? words.status.cancelled : words.status.added,
                            title: planned.title,
                            reason: planned.reason,
                          })
                        : bought
                          ? name
                            ? fillIn(words.bought, { name })
                            : words.boughtLine
                          : isReceipt
                            ? name
                              ? fillIn(words.tracking, { name })
                              : words.trackingNew
                            : name
                              ? fillIn(words.alsoGroceries, { name })
                              : words.alsoGroceriesPlain;
                      const undoLabel = bought
                        ? name
                          ? fillIn(words.undoRecording, { title: name })
                          : words.undoRecordingLine
                        : name
                          ? fillIn(planned?.action === "updated" ? words.undoUpdating : words.undoAdding, { title: name })
                          : planned?.action === "updated"
                            ? words.undoUpdatingGrocery
                            : words.undoAddingGrocery;
                      return (
                      <div key={change.id} className="ml-11 flex items-center gap-2 text-xs text-[var(--wh-foreground-subtle)]">
                        {bought ? <Receipt aria-hidden className="size-3.5 shrink-0" /> : change.domain === "school_item" ? <GraduationCap aria-hidden className="size-3.5 shrink-0" /> : change.domain === "bill" ? <Wallet aria-hidden className="size-3.5 shrink-0" /> : <ShoppingBasket aria-hidden className="size-3.5 shrink-0" />}
                        <span className="flex-1 break-words">{said}</span>
                        {!change.undoneAt ? (
                          <form action={undoAction}>
                            <input type="hidden" name="householdId" value={householdId} />
                            <input type="hidden" name="changeId" value={change.id} />
                            <Pill type="submit" tone="quiet" disabled={undoing} aria-label={undoLabel}>
                              {undoing ? review.undoing : words.undo}
                            </Pill>
                          </form>
                        ) : (
                          <Badge tone="neutral">{words.status.undone}</Badge>
                        )}
                      </div>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
          </Card>
          {undoState.error ? <Alert>{undoState.error}</Alert> : null}
        </section>
      ) : null}

      {pending.length === 0 && failed.length === 0 && history.length === 0 ? (
        filterLabel ? (
          <EmptyState icon={UploadCloud} tone="ai" title={fillIn(words.emptyChannelTitle, { channel: filterLabel })} description={words.emptyChannelDescription} />
        ) : (
          <EmptyState icon={UploadCloud} tone="ai" title={words.emptyTitle} description={words.emptyDescription} />
        )
      ) : null}
    </div>
  );
}
