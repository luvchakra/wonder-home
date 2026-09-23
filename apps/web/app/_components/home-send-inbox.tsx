"use client";

import { Camera, ClipboardPaste, GraduationCap, HeartPulse, HelpCircle, Link2, Mic, PenLine, Receipt, ShieldAlert, ShoppingBasket, UploadCloud, Wallet, X } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { gateTranscript, uncertainTranscriptPrompt } from "@wonderhome/core/homesend/audio";
import { FAILURE_REASON_COPY, type HomeSendChange } from "@wonderhome/core/homesend/items";
import { ACCEPTED_UPLOAD_TYPES } from "@wonderhome/core/homesend/normalize";
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
import { describeSource, HomeSendConfirmStep, TranscriptCheck, type ReviewConfirmation, type ReviewReconciliation, type ReviewSubject } from "./home-send-intake";

/** What the server prepared for an item already waiting (`home-send-review.ts`): who it is for, and whether it is already on record. */
export type PreparedReview = { subject: ReviewSubject | null; reconciliation: ReviewReconciliation | null; confirmation?: ReviewConfirmation | null };

const KIND_PRESENTATION: Record<string, { icon: typeof Wallet; tone: IconTone; label: string }> = {
  bill: { icon: Wallet, tone: "money", label: "Bill" },
  school_item: { icon: GraduationCap, tone: "school", label: "School" },
  grocery_item: { icon: ShoppingBasket, tone: "care", label: "Grocery" },
  health_document: { icon: HeartPulse, tone: "health", label: "Health" },
  receipt: { icon: Receipt, tone: "care", label: "Receipt" },
  unknown: { icon: HelpCircle, tone: "neutral", label: "Not sure yet" },
};

function presentationFor(kind: string | null): { icon: typeof Wallet; tone: IconTone; label: string } {
  return KIND_PRESENTATION[kind ?? "unknown"] ?? KIND_PRESENTATION.unknown!;
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
function titleFor(item: HomeSendItem): string {
  if (item.extracted?.title) return item.extracted.title;
  if (item.understanding?.contentSummary) return item.understanding.contentSummary;
  if (item.subject) return item.subject;
  if (item.sourceUrl) return item.sourceUrl;
  if (item.rawText) return firstSentence(item.rawText);
  return describeSource(item.understanding ?? { provenance: { channel: item.source, transcriptConfidence: null, url: null, subject: null, sender: null, filename: null } }, { contentType: item.contentType });
}

/** A voice note still waiting for the household to check what was heard (§17). */
function uncheckedTranscript(item: HomeSendItem): { text: string; prompt: string } | null {
  if (item.source !== "audio_note" || item.classifiedKind !== "unknown" || !item.rawText || item.transcriptConfidence === null) return null;
  const gate = gateTranscript({ text: item.rawText, confidence: item.transcriptConfidence });
  return gate.outcome === "uncertain" ? { text: gate.text, prompt: uncertainTranscriptPrompt(gate) } : null;
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
}: {
  householdId: string;
  kids: { id: string; displayName: string }[];
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

  const [mode, setMode] = useState<"drop" | "paste">("drop");
  const [dragOver, setDragOver] = useState(false);
  const [openItem, setOpenItem] = useState<OpenItem | null>(null);
  const [failedNotice, setFailedNotice] = useState<string | null>(null);
  // Applied on its own under the household's own autonomy setting (§12):
  // said so, with its Undo right here as well as in "Recently handled".
  const [autoApplied, setAutoApplied] = useState<{ notice: string; changeId: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const busy = uploading || pasting;

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

  function review(item: HomeSendItem, handFill = false) {
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
              <p className="text-sm font-medium">Drag a photo, PDF, text file or voice note here</p>
              <p className="mt-0.5 text-xs text-[var(--wh-foreground-subtle)]">A bill, a school notice, a grocery ask — whatever you were sent, up to 4MB</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Pill type="button" tone="soft" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  <Camera aria-hidden className="size-3.5" /> {uploading ? "Reading…" : "Choose a file"}
                </Pill>
                <Pill type="button" tone="quiet" onClick={() => setMode(mode === "paste" ? "drop" : "paste")} disabled={busy}>
                  <ClipboardPaste aria-hidden className="size-3.5" /> Paste a message or link
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
            {failedNotice ? <Alert>{failedNotice} It&apos;s kept below under &ldquo;Failed safely&rdquo;.</Alert> : null}
            {autoApplied ? (
              <Alert tone="info">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words">{autoApplied.notice}</span>
                  <form action={undoAction}>
                    <input type="hidden" name="householdId" value={householdId} />
                    <input type="hidden" name="changeId" value={autoApplied.changeId} />
                    <Pill type="submit" tone="quiet" disabled={undoing} aria-label={`Undo adding ${autoApplied.title}`}>
                      {undoing ? "Undoing…" : "Undo"}
                    </Pill>
                  </form>
                </span>
              </Alert>
            ) : null}

            {mode === "paste" ? (
              <form action={pasteAction} className="space-y-3">
                <input type="hidden" name="householdId" value={householdId} />
                {pasteState.error ? <Alert>{pasteState.error}</Alert> : null}
                <label htmlFor="home-send-text" className="block text-sm font-medium">Paste a forwarded message, or a link to a web page</label>
                <textarea
                  id="home-send-text"
                  name="text"
                  rows={5}
                  required
                  placeholder="Paste a bill reminder, a school notice, a grocery ask — or a link…"
                  className="block w-full resize-none rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
                />
                <Pill type="submit" tone="primary" disabled={busy} className="w-full justify-center">
                  {pasting ? "Reading…" : "Read this"}
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
            />
            <form action={dismissAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <input type="hidden" name="itemId" value={openItem.id} />
              <Pill type="submit" tone="quiet" disabled={confirmingTranscript || dismissing} className="w-full justify-center">
                {dismissing ? "Dismissing…" : "Not worth adding"}
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
            />
            <form action={dismissAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <input type="hidden" name="itemId" value={openItem.id} />
              <Pill type="submit" tone="quiet" disabled={routing || dismissing} className="w-full justify-center">
                {dismissing ? "Dismissing…" : "Not worth adding"}
              </Pill>
            </form>
            {dismissState.error ? <Alert>{dismissState.error}</Alert> : null}
          </div>
        )}
      </Card>

      {pendingOthers.length > 0 ? (
        <section>
          <SectionHeader title="Needs your review" count={pendingOthers.length} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {pendingOthers.map((item) => {
                const heard = uncheckedTranscript(item);
                const presentation = item.source === "audio_note" && heard ? { icon: Mic, tone: "neutral" as IconTone, label: "Voice note" } : presentationFor(item.classifiedKind);
                const reason = heard ? "Check what WonderHome heard" : describeSource(item.understanding, { contentType: item.contentType, receivedAt: item.createdAt });
                const title = titleFor(item);
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words">{title}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{presentation.label} · {reason}</span>
                    </span>
                    <Pill type="button" tone="soft" onClick={() => review(item)} aria-label={`Review ${title}`}>
                      Review
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
          <SectionHeader title="Failed safely" count={failedOthers.length} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {failedOthers.map((item) => {
                const title = titleFor(item);
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <IconTile icon={item.source === "link" ? Link2 : ShieldAlert} tone="neutral" size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words">{title}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{item.failureReason ? FAILURE_REASON_COPY[item.failureReason] : "Couldn't be read."}</span>
                    </span>
                    <Pill type="button" tone="quiet" onClick={() => review(item, true)} aria-label={`Fill in ${title} by hand`} title="Fill in by hand">
                      <PenLine aria-hidden className="size-3.5" />
                    </Pill>
                    <form action={dismissAction}>
                      <input type="hidden" name="householdId" value={householdId} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <Pill type="submit" tone="quiet" disabled={dismissing} aria-label={`Dismiss ${title}`} title="Dismiss">
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
          <SectionHeader title="Recently handled" count={history.length} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {history.map((item) => {
                const title = titleFor(item);
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
                const presentation = presentationFor(isReceipt ? "receipt" : (primaryChange?.domain ?? item.classifiedKind));
                const canUndoPrimary = Boolean(primaryChange && !primaryChange.undoneAt);
                const statusLabel =
                  item.status === "dismissed"
                    ? item.reviewDecision === "kept_existing"
                      ? "Kept existing"
                      : "Dismissed"
                    : isReceipt
                      ? itemChanges.length > 0 && itemChanges.every((change) => change.undoneAt)
                        ? "Undone"
                        : "Recorded"
                      : primaryChange?.undoneAt
                        ? "Undone"
                      : primaryChange?.changeType === "updated"
                        ? "Updated"
                        : primaryChange?.changeType === "cancelled"
                          ? "Cancelled"
                          : "Added";
                return (
                  <li key={item.id} className="space-y-1.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium break-words">{title}</span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                          {presentation.label}
                          {primaryChange && primaryChange.changeType !== "created" && !primaryChange.undoneAt ? ` · ${statusLabel} the one on record` : ""}
                          {item.reviewDecision === "auto_added" && !primaryChange?.undoneAt ? " · Added on its own" : ""}
                        </span>
                      </span>
                      {canUndoPrimary ? (
                        <form action={undoAction}>
                          <input type="hidden" name="householdId" value={householdId} />
                          <input type="hidden" name="changeId" value={primaryChange!.id} />
                          <Pill type="submit" tone="quiet" disabled={undoing} aria-label={`Undo ${statusLabel === "Added" ? "adding" : statusLabel === "Updated" ? "updating" : "cancelling"} ${title}`}>
                            {undoing ? "Undoing…" : "Undo"}
                          </Pill>
                        </form>
                      ) : (
                        <Badge tone={statusLabel === "Added" || statusLabel === "Recorded" ? "handled" : "neutral"}>{statusLabel}</Badge>
                      )}
                    </div>
                    {secondaryChanges.map((change) => {
                      const bought = change.domain === "purchase";
                      const name = bought ? purchaseNames[change.entityId] : groceryNames[change.entityId];
                      const said = bought
                        ? `Bought: ${name ?? "a line from this receipt"}`
                        : isReceipt
                          ? `Now tracking${name ? `: ${name}` : " a new item"}`
                          : `Also added to Groceries${name ? `: ${name}` : ""}`;
                      return (
                      <div key={change.id} className="ml-11 flex items-center gap-2 text-xs text-[var(--wh-foreground-subtle)]">
                        {bought ? <Receipt aria-hidden className="size-3.5 shrink-0" /> : <ShoppingBasket aria-hidden className="size-3.5 shrink-0" />}
                        <span className="flex-1 break-words">{said}</span>
                        {!change.undoneAt ? (
                          <form action={undoAction}>
                            <input type="hidden" name="householdId" value={householdId} />
                            <input type="hidden" name="changeId" value={change.id} />
                            <Pill type="submit" tone="quiet" disabled={undoing} aria-label={bought ? `Undo recording ${name ?? "this line"}` : `Undo adding ${name ?? "the grocery item"}`}>
                              {undoing ? "Undoing…" : "Undo"}
                            </Pill>
                          </form>
                        ) : (
                          <Badge tone="neutral">Undone</Badge>
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
        <EmptyState icon={UploadCloud} tone="ai" title="Nothing sent yet" description="Drag a photo, PDF or voice note above, or paste something you were forwarded, and WonderHome reads it for you." />
      ) : null}
    </div>
  );
}
