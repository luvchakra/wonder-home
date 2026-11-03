"use client";

import { Archive, Camera, CheckCircle2, ClipboardPaste, GraduationCap, HeartPulse, HelpCircle, Link2, Mic, PenLine, Receipt, ShieldAlert, ShoppingBasket, UploadCloud, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { suggestedIntakeKind } from "@wonderhome/core/ai/intake-kind-check";
import { gateTranscript } from "@wonderhome/core/homesend/audio";
import { questionsLeft } from "@wonderhome/core/homesend/checking";
import { failedTitleKey, groupIdentical, sentenceCase } from "@wonderhome/core/homesend/inbox-view";
import type { HomeSendChange } from "@wonderhome/core/homesend/items";
import { ACCEPTED_UPLOAD_TYPES } from "@wonderhome/core/homesend/normalize";
import type { DocumentPlan } from "@wonderhome/core/homesend/plan";
import type { IntakeUnderstanding } from "@wonderhome/core/homesend/understanding";
import { cn } from "@wonderhome/core/lib/cn";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";
import { Badge, Pill, PillLink } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import {
  confirmHomeSendEntryAction,
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
import { addSelectedHomeSendItemsAction, retryHomeSendItemAction, type BulkAddState, type ItemActionState } from "../(auth)/home-send-bulk-actions";
import { archiveSelectedHomeSendAction, restoreArchivedHomeSendAction, type ClearState } from "../(auth)/home-send-clear-actions";
import { countWords, fillIn, type HomeSendPageLabels, type HomeSendSourceLabels } from "../_lib/homesend-labels";
import { HomeSendClear, type ClearCounts } from "./home-send-clear";
import { describeSource, HomeSendConfirmStep, TranscriptCheck, type ReviewConfirmation, type ReviewReconciliation, type ReviewSubject } from "./home-send-intake";

/** What the server prepared for an item already waiting (`home-send-review.ts`): who it is for, and whether it is already on record. */
export type PreparedReview = {
  subject: ReviewSubject | null;
  reconciliation: ReviewReconciliation | null;
  confirmation?: ReviewConfirmation | null;
  plan?: DocumentPlan | null;
  /** Why it waits when it would otherwise be added on its own ("already on the shopping list"), worded on the server (I-27). */
  waitWords?: string | null;
  /** Why it waits, whatever the reason ("a photo", "amount not clear", "possible duplicate of …"), worded on the server from evidence. */
  why?: string | null;
  /** The row's one plain line: why it waits, nothing else (the calm page, the owner 2026-11-03). */
  reason?: string | null;
  /** One yes among several is all it needs (`waiting.ts` `bulkReady`): it may be ticked and added with others. */
  ready?: boolean;
};

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
  pendingTotal,
  lead,
  isAdmin = false,
  clearCounts = null,
  moreHref = null,
  failedInfo = {},
  archived = null,
  labels,
}: {
  /** The opening sentence (rule 7): the situation in one line, with the counts. */
  lead: string;
  /** Admins see the two one-tap clears; the server checks again. */
  isAdmin?: boolean;
  /** What "Archive all" and "Add all anyway" would touch, for their confirms. */
  clearCounts?: ClearCounts | null;
  /** Every waiting item, of which `pending` is the page shown. */
  pendingTotal?: number;
  /** "Show more": the next page of waiting items, when there is one. */
  moreHref?: string | null;
  /** What "Try again" can do for each failed item, and its tries so far, worded on the server. */
  failedInfo?: Record<string, { canRetry: boolean; line: string | null }>;
  /** The link to what the 30-day archive set aside, when anything is there. */
  archived?: { href: string; label: string } | null;
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
}) {
  const [uploadState, uploadAction, uploading] = useActionState<SendHomeItemState, FormData>(uploadHomeSendItemAction, {});
  const [pasteState, pasteAction, pasting] = useActionState<SendHomeItemState, FormData>(pasteHomeSendItemAction, {});
  const [transcriptState, transcriptAction, confirmingTranscript] = useActionState<SendHomeItemState, FormData>(confirmTranscriptAction, {});
  const [routeState, routeAction, routing] = useActionState<RouteHomeItemState, FormData>(routeHomeSendItemAction, {});
  const [dismissState, dismissAction, dismissing] = useActionState<RouteHomeItemState, FormData>(dismissHomeSendItemAction, {});
  const [undoState, undoAction, undoing] = useActionState<RouteHomeItemState, FormData>(undoHomeSendChangeAction, {});
  const [confirmState, confirmAction, confirming] = useActionState<RouteHomeItemState, FormData>(confirmHomeSendEntryAction, {});
  const [bulkState, bulkAction, bulkAdding] = useActionState<BulkAddState, FormData>(addSelectedHomeSendItemsAction, {});
  const [retryState, retryAction, retrying] = useActionState<ItemActionState, FormData>(retryHomeSendItemAction, {});
  const [archiveSelectedState, archiveSelected, archivingSelected] = useActionState<ClearState, FormData>(archiveSelectedHomeSendAction, {});
  const [restoreSelectedState, restoreSelected, restoringSelected] = useActionState<ClearState, FormData>(restoreArchivedHomeSendAction, {});
  // Rows chosen after tapping "Select" (by group), rows opened to their detail, and the "Send something" row opened.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());

  const [mode, setMode] = useState<"drop" | "paste">("drop");
  const [dragOver, setDragOver] = useState(false);
  const [openItem, setOpenItem] = useState<OpenItem | null>(null);
  const [planApplied, setPlanApplied] = useState(false);
  const [failedNotice, setFailedNotice] = useState<string | null>(null);
  // Applied on its own under the household's own autonomy setting (§12):
  // said so, with its Undo right here as well as in "Recently handled".
  const [autoApplied, setAutoApplied] = useState<{ notice: string; changeId: string; title: string; itemId?: string; whole?: boolean } | null>(null);
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
    setAutoApplied(
      fresh.autoApplied
        ? { notice: fresh.notice ?? "", changeId: fresh.autoApplied.changeId, title: fresh.autoApplied.title, itemId: fresh.autoApplied.itemId, whole: fresh.autoApplied.whole }
        : null,
    );
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

  const [seenBulk, setSeenBulk] = useState(bulkState);
  if (bulkState !== seenBulk) {
    setSeenBulk(bulkState);
    if (bulkState.results) {
      setSelected(new Set());
      setHandled(new Set([...handled, ...bulkState.results.filter((result) => result.added).map((result) => result.id)]));
    }
  }

  // Routing or dismissing closes the confirm step and clears the drop zone
  // back to its resting state, same as `HomeSendSheet` closing itself.
  const closedNotice = routeState.notice ?? dismissState.notice ?? undoState.notice ?? confirmState.notice ?? null;
  const [seenClosedNotice, setSeenClosedNotice] = useState(closedNotice);
  if (closedNotice !== seenClosedNotice) {
    setSeenClosedNotice(closedNotice);
    if (closedNotice) {
      // The one just handled is set aside until the page reloads its list.
      if (openItem) setHandled(new Set([...handled, openItem.id]));
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
  const defaultKind = suggestedIntakeKind(openItem?.classifiedKind, prefill);
  const pendingOthers = pending.filter((item) => item.id !== openItem?.id && !handled.has(item.id));
  const readyIds = pendingOthers.filter((item) => reviews[item.id]?.ready).map((item) => item.id);
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const failedOthers = failed.filter((item) => item.id !== openItem?.id);
  const changesByIntakeId = new Map<string, HomeSendChange[]>();
  for (const change of changes) {
    const list = changesByIntakeId.get(change.intakeId) ?? [];
    list.push(change);
    changesByIntakeId.set(change.intakeId, list);
  }

  const calm = words.calm;
  // Identical waiting items fold into one row (the owner, 2026-11-03): five "Swag Labs product listing" are one thing to decide.
  const groups = groupIdentical(pendingOthers);
  const idsOf = (key: string) => groups.find((group) => group.key === key)?.items.map((item) => item.id) ?? [];
  const selectedIds = groups.filter((group) => selected.has(group.key)).flatMap((group) => group.items.map((item) => item.id));
  const selectedReady = selectedIds.filter((id) => readyIds.includes(id));
  const toggleGroup = (key: string) => toggle(key);
  const toggleOpen = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Added as Checking with HomeTalk's questions still open: one answer settles it, so it needs a word.
  const checkingRows = history.flatMap((item) => {
    const itemChanges = changesByIntakeId.get(item.id) ?? [];
    if (!itemChanges.some((change) => !change.undoneAt && change.confirmationState === "unconfirmed")) return [];
    const left = questionsLeft((item.understanding as { checking?: unknown } | null)?.checking);
    return left > 0 ? [{ item, left }] : [];
  });
  const answering = new Set(checkingRows.map((row) => row.item.id));
  const added = history.filter((item) => !answering.has(item.id));
  const needsCount = groups.length + checkingRows.length + Math.max(0, (pendingTotal ?? pending.length) - pending.length);

  const archiveDone = archiveSelectedState.done === "archived" && restoreSelectedState.done !== "restored" ? (archiveSelectedState.archivedIds ?? []) : [];
  const leadLine = <p className="text-base font-medium text-[var(--wh-foreground)]">{lead}</p>;

  return (
    <div className="space-y-5">
      {isAdmin && clearCounts ? <HomeSendClear householdId={householdId} counts={clearCounts} labels={labels} lead={leadLine} /> : leadLine}

      {/* "Send something": one compact row that opens on tap; a file dropped anywhere on it is read (rule 15 keeps the whole drop zone a tap away). */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
      <Card className={cn("space-y-3 p-3", dragOver && "outline-2 outline-dashed outline-[var(--wh-primary)]")}>
        <form ref={uploadFormRef} action={uploadAction} className="hidden">
          <input type="hidden" name="householdId" value={householdId} />
          <input ref={fileInputRef} type="file" name="photo" accept={ACCEPTED_UPLOAD_TYPES} className="sr-only" onChange={() => uploadFormRef.current?.requestSubmit()} />
        </form>
        {!openItem ? (
          <>
            {!sendOpen ? (
              <button type="button" onClick={() => setSendOpen(true)} className="flex w-full items-center gap-3 rounded-[var(--wh-radius-sm)] text-left" aria-expanded={false}>
                <IconTile icon={UploadCloud} tone="ai" size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{uploading || pasting ? review.reading : calm.sendTitle}</span>
                  <span className="block text-xs text-[var(--wh-foreground-subtle)]">{calm.sendHint}</span>
                </span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <IconTile icon={UploadCloud} tone="ai" size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{calm.sendTitle}</span>
                    <span className="block text-xs text-[var(--wh-foreground-subtle)]">{words.dropHint}</span>
                  </span>
                  <Pill type="button" tone="quiet" onClick={() => { setSendOpen(false); setMode("drop"); }} aria-expanded>
                    {calm.sendClose}
                  </Pill>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill type="button" tone="soft" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                    <Camera aria-hidden className="size-3.5" /> {uploading ? review.reading : words.chooseFile}
                  </Pill>
                  <Pill type="button" tone="quiet" onClick={() => setMode(mode === "paste" ? "drop" : "paste")} disabled={busy}>
                    <ClipboardPaste aria-hidden className="size-3.5" /> {words.paste}
                  </Pill>
                </div>
                <p className="hidden text-xs text-[var(--wh-foreground-subtle)] lg:block">{words.dropTitle}</p>
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
              </div>
            )}
            {uploadState.error ? <Alert>{uploadState.error}</Alert> : null}
            {failedNotice ? <Alert>{failedNotice}</Alert> : null}
            {autoApplied ? (
              <Alert tone="info">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words">{autoApplied.notice}</span>
                  <form action={undoAction}>
                    <input type="hidden" name="householdId" value={householdId} />
                    {/* A receipt's lines are undone together, by the item. */}
                    {autoApplied.whole && autoApplied.itemId ? (
                      <input type="hidden" name="itemId" value={autoApplied.itemId} />
                    ) : (
                      <input type="hidden" name="changeId" value={autoApplied.changeId} />
                    )}
                    <Pill type="submit" tone="quiet" disabled={undoing} aria-label={fillIn(words.undoAdding, { title: autoApplied.title })}>
                      {undoing ? review.undoing : words.undo}
                    </Pill>
                  </form>
                </span>
              </Alert>
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
      </div>

      {bulkState.error ? <Alert>{bulkState.error}</Alert> : null}
      {bulkState.results && bulkState.results.length > 0 ? (
        <Alert tone={bulkState.results.every((result) => result.added) ? "info" : undefined}>
          <span className="block">{countWords(words.bulk.added, bulkState.results.filter((result) => result.added).length)}</span>
          {bulkState.results
            .filter((result) => !result.added)
            .map((result) => (
              <span key={result.id} className="block break-words">{fillIn(words.bulk.notAdded, { title: result.title || words.kind.unknown || "" })}</span>
            ))}
        </Alert>
      ) : null}
      {archiveSelectedState.error ? <Alert>{archiveSelectedState.error}</Alert> : null}
      {archiveDone.length > 0 ? (
        <Alert tone="info">
          <span className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">{countWords(calm.clear.archived, archiveDone.length)}</span>
            <form action={restoreSelected}>
              <input type="hidden" name="householdId" value={householdId} />
              {archiveDone.map((id) => (
                <input key={id} type="hidden" name="itemId" value={id} />
              ))}
              <Pill type="submit" tone="quiet" disabled={restoringSelected}>
                {restoringSelected ? review.undoing : words.undo}
              </Pill>
            </form>
          </span>
        </Alert>
      ) : null}

      {needsCount > 0 ? (
        <section className="space-y-2" aria-labelledby="home-send-needs">
          <SectionHeader
            title={calm.needsTitle}
            action={
              groups.length > 1 ? (
                <Pill type="button" tone="quiet" onClick={() => { setSelecting(!selecting); setSelected(new Set()); }} aria-pressed={selecting}>
                  {selecting ? calm.select.done : calm.select.start}
                </Pill>
              ) : undefined
            }
          />
          {selecting && selectedIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedReady.length > 0 ? (
                <form action={bulkAction}>
                  <input type="hidden" name="householdId" value={householdId} />
                  {selectedReady.map((id) => (
                    <input key={id} type="hidden" name="itemId" value={id} />
                  ))}
                  <Pill type="submit" tone="primary" disabled={bulkAdding}>
                    {bulkAdding ? words.bulk.adding : fillIn(words.bulk.addSelected, { count: selectedReady.length })}
                  </Pill>
                </form>
              ) : null}
              <form action={archiveSelected}>
                <input type="hidden" name="householdId" value={householdId} />
                {selectedIds.map((id) => (
                  <input key={id} type="hidden" name="itemId" value={id} />
                ))}
                <Pill type="submit" tone="quiet" disabled={archivingSelected}>
                  {fillIn(calm.select.archive, { count: selectedIds.length })}
                </Pill>
              </form>
            </div>
          ) : null}
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {checkingRows.map(({ item, left }) => {
                const title = titleFor(item, review.source);
                const presentation = presentationFor(item.classifiedKind, words.kind);
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words">{title}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{countWords(calm.questions, left)}</span>
                    </span>
                    <PillLink href="/ai" tone="soft" aria-label={fillIn(calm.answerAria, { title })}>
                      {calm.answer}
                    </PillLink>
                  </li>
                );
              })}
              {groups.map((group) => {
                const item = group.first;
                const heard = uncheckedTranscript(item);
                const presentation = item.source === "audio_note" && heard ? { icon: Mic, tone: "neutral" as IconTone, label: words.voiceNote } : presentationFor(item.classifiedKind, words.kind);
                const reason = heard ? words.checkHeard : sentenceCase(reviews[item.id]?.reason ?? reviews[item.id]?.waitWords ?? presentation.label);
                const name = titleFor(item, review.source);
                const many = group.items.length;
                const title = many > 1 ? `${name} ×${many}` : name;
                const ready = many === 1 && Boolean(reviews[item.id]?.ready);
                const open = expanded.has(group.key);
                const sure = percentNumber(item.understanding);
                return (
                  <li key={group.key} className="py-2.5">
                    <div className="flex items-center gap-3">
                      {selecting ? (
                        <input
                          type="checkbox"
                          checked={selected.has(group.key)}
                          onChange={() => toggleGroup(group.key)}
                          aria-label={fillIn(calm.select.choose, { title })}
                          className="size-5 shrink-0 accent-[var(--wh-primary)]"
                        />
                      ) : null}
                      <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                      <button
                        type="button"
                        onClick={() => (many > 1 ? toggleOpen(group.key) : openReview(item))}
                        aria-expanded={many > 1 ? open : undefined}
                        aria-label={fillIn(calm.detailAria, { title })}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block text-sm font-medium break-words">{title}</span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">{reason}</span>
                      </button>
                      {ready ? (
                        <form action={bulkAction}>
                          <input type="hidden" name="householdId" value={householdId} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <Pill type="submit" tone="soft" disabled={bulkAdding || routing} aria-label={fillIn(calm.addAria, { title })}>
                            {calm.add}
                          </Pill>
                        </form>
                      ) : (
                        <Pill type="button" tone="soft" onClick={() => openReview(item)} aria-label={fillIn(calm.checkAria, { title })}>
                          {calm.check}
                        </Pill>
                      )}
                    </div>
                    {open ? (
                      <div className="mt-2 ml-11 space-y-2 text-xs text-[var(--wh-foreground-muted)]">
                        {sure !== null ? <p>{fillIn(calm.wasNotSure, { percent: sure })}</p> : null}
                        <p>{fillIn(calm.received, { when: group.items.map((entry) => shortDay(entry.createdAt, review.source)).join(", ") })}</p>
                        <form action={archiveSelected}>
                          <input type="hidden" name="householdId" value={householdId} />
                          {idsOf(group.key).map((id) => (
                            <input key={id} type="hidden" name="itemId" value={id} />
                          ))}
                          <Pill type="submit" tone="quiet" disabled={archivingSelected}>
                            {countWords(calm.archiveGroup, many)}
                          </Pill>
                        </form>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
          {moreHref ? (
            <Link href={moreHref} className="block text-center text-sm font-medium text-[var(--wh-primary)]">
              {words.bulk.showMore}
            </Link>
          ) : null}
        </section>
      ) : null}

      {failedOthers.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader title={calm.failedTitle} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {failedOthers.map((item) => {
                const title = calm.failedName[failedTitleKey(item)];
                const open = expanded.has(item.id);
                const canRetry = Boolean(failedInfo[item.id]?.canRetry) && !(retryState.itemId === item.id && retryState.done);
                const reason = sentenceCase(item.failureReason ? (words.failure[item.failureReason] ?? words.couldNotRead) : words.couldNotRead);
                const status = retryState.itemId === item.id && retryState.done === "retry_queued" ? words.retry.queued : (failedInfo[item.id]?.line ?? null);
                return (
                  <li key={item.id} className="py-2.5">
                    <div className="flex items-center gap-3">
                      <IconTile icon={item.source === "link" ? Link2 : ShieldAlert} tone="neutral" size="sm" />
                      <button type="button" onClick={() => toggleOpen(item.id)} aria-expanded={open} aria-label={fillIn(calm.detailAria, { title })} className="min-w-0 flex-1 text-left">
                        <span className="block text-sm font-medium break-words">{title}</span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">{reason}</span>
                      </button>
                      {canRetry ? (
                        <form action={retryAction}>
                          <input type="hidden" name="householdId" value={householdId} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <Pill type="submit" tone="soft" disabled={retrying} aria-label={fillIn(words.retry.tryAgainAria, { title })}>
                            {words.retry.tryAgain}
                          </Pill>
                        </form>
                      ) : (
                        <Pill type="button" tone="soft" onClick={() => openReview(item, true)} aria-label={fillIn(words.fillByHandAria, { title })}>
                          {calm.fillIn}
                        </Pill>
                      )}
                    </div>
                    {retryState.itemId === item.id && retryState.error ? <p className="mt-1 ml-11 text-xs text-[var(--wh-foreground-muted)]">{retryState.error}</p> : null}
                    {open ? (
                      <div className="mt-2 ml-11 space-y-2 text-xs text-[var(--wh-foreground-muted)]">
                        {status ? <p>{status}</p> : null}
                        {item.sourceUrl || item.rawText ? (
                          <div>
                            <p className="font-medium text-[var(--wh-foreground)]">{calm.whatWasSent}</p>
                            <p className="mt-1 max-h-48 overflow-y-auto rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-2 break-words whitespace-pre-wrap">{item.sourceUrl ?? item.rawText}</p>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          {canRetry ? (
                            <Pill type="button" tone="quiet" onClick={() => openReview(item, true)} aria-label={fillIn(words.fillByHandAria, { title })}>
                              <PenLine aria-hidden className="size-3.5" /> {words.fillByHand}
                            </Pill>
                          ) : null}
                          <form action={archiveSelected}>
                            <input type="hidden" name="householdId" value={householdId} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <Pill type="submit" tone="quiet" disabled={archivingSelected}>
                              <Archive aria-hidden className="size-3.5" /> {countWords(calm.archiveGroup, 1)}
                            </Pill>
                          </form>
                          <form action={dismissAction}>
                            <input type="hidden" name="householdId" value={householdId} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <Pill type="submit" tone="quiet" disabled={dismissing} aria-label={fillIn(words.dismissAria, { title })}>
                              <X aria-hidden className="size-3.5" /> {words.dismiss}
                            </Pill>
                          </form>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}

      {added.length > 0 ? (
        <CollapsibleSection icon={CheckCircle2} tone="primary" title={calm.addedTitle} intro={calm.addedIntro} count={added.length} as="h2">
          <ul className="divide-y divide-[var(--wh-border)] px-4 pb-2">
              {added.map((item) => {
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
                // Added below the bar and still being checked (the owner, 2026-11-03): says so in words, with "Looks right" as its one action.
                const checking = itemChanges.some((change) => !change.undoneAt && change.confirmationState === "unconfirmed");
                const onRecord =
                  status === "updated" ? words.updatedOnRecord : status === "cancelled" ? words.cancelledOnRecord : statusLabel;
                const reason = checking ? calm.looksRightAsk : primaryChange && primaryChange.changeType !== "created" && !primaryChange.undoneAt ? `${presentation.label} · ${onRecord}` : presentation.label;
                return (
                  <li key={item.id} className="space-y-1.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium break-words">
                          {title}
                          {checking ? (
                            <Badge tone="attention" className="ml-2 align-middle">
                              {words.checking}
                            </Badge>
                          ) : null}
                        </span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">{reason}</span>
                      </span>
                      {checking ? (
                        <form action={confirmAction}>
                          <input type="hidden" name="householdId" value={householdId} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <Pill type="submit" tone="soft" disabled={confirming} aria-label={fillIn(words.looksRightAria, { title })}>
                            {words.looksRight}
                          </Pill>
                        </form>
                      ) : canUndoPrimary ? (
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
                    {checking && canUndoPrimary ? (
                      <form action={undoAction} className="ml-11">
                        <input type="hidden" name="householdId" value={householdId} />
                        <input type="hidden" name="changeId" value={primaryChange!.id} />
                        <button type="submit" disabled={undoing} className="text-xs font-medium text-[var(--wh-foreground-muted)] underline-offset-2 hover:underline" aria-label={fillIn(words.undoAdding, { title })}>
                          {undoing ? review.undoing : words.undo}
                        </button>
                      </form>
                    ) : null}
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
          {undoState.error ? <Alert>{undoState.error}</Alert> : null}
          {confirmState.error ? <Alert>{confirmState.error}</Alert> : null}
        </CollapsibleSection>
      ) : null}

      {archived ? (
        <Link href={archived.href} className="flex items-center justify-center gap-1.5 text-sm text-[var(--wh-foreground-muted)]">
          <Archive aria-hidden className="size-4" /> {archived.label}
        </Link>
      ) : null}

      {pending.length === 0 && failed.length === 0 && history.length === 0 && !openItem ? (
        <EmptyState icon={UploadCloud} tone="ai" title={words.emptyTitle} description={words.emptyDescription} />
      ) : null}
    </div>
  );
}

/** "3 Nov": the day it arrived, in the viewer's month names, on the UTC day (server and browser agree). */
function shortDay(iso: string, words: HomeSendSourceLabels): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return fillIn(words.day, { day: when.getUTCDate(), month: words.months[when.getUTCMonth()] ?? "" });
}

/** How sure the reading was, as a whole percent, for the row's detail; null when it wasn't read. */
function percentNumber(understanding: Pick<IntakeUnderstanding, "readable" | "score"> | null | undefined): number | null {
  if (!understanding?.readable || typeof understanding.score !== "number") return null;
  return Math.round(understanding.score * 100);
}
