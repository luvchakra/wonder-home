"use client";

import { Camera, ClipboardPaste, HeartPulse, HelpCircle, ShoppingBasket, UploadCloud, Wallet, GraduationCap } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge, Pill } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";
import { cn } from "@wonderhome/core/lib/cn";

import type { HomeSendChange } from "@wonderhome/core/homesend/items";

import {
  dismissHomeSendItemAction,
  pasteHomeSendItemAction,
  routeHomeSendItemAction,
  undoHomeSendChangeAction,
  uploadHomeSendItemAction,
  type HomeSendItem,
  type RouteHomeItemState,
  type SendHomeItemState,
} from "../(auth)/home-send-actions";
import { HomeSendConfirmStep } from "./home-send-intake";

const KIND_PRESENTATION: Record<string, { icon: typeof Wallet; tone: IconTone; label: string }> = {
  bill: { icon: Wallet, tone: "money", label: "Bill" },
  school_item: { icon: GraduationCap, tone: "school", label: "School" },
  grocery_item: { icon: ShoppingBasket, tone: "care", label: "Grocery" },
  health_document: { icon: HeartPulse, tone: "health", label: "Health" },
  unknown: { icon: HelpCircle, tone: "neutral", label: "Not sure yet" },
};

function presentationFor(kind: string | null): { icon: typeof Wallet; tone: IconTone; label: string } {
  return KIND_PRESENTATION[kind ?? "unknown"] ?? KIND_PRESENTATION.unknown!;
}

type OpenItem = { id: string; classifiedKind: string; extracted: HomeSendItem["extracted"]; reconciliation?: { verdict: string; message: string } | null };

/**
 * HomeSend's own screen: a drop zone (plus click-to-browse, since drag has
 * no equivalent on a phone) and a paste option feed the same classify step
 * the composer's paperclip already uses, an inbox of what is waiting on a
 * confirm, and a short record of what was already routed or dismissed.
 */
export function HomeSendInbox({
  householdId,
  kids,
  pending,
  history,
  changes,
}: {
  householdId: string;
  kids: { id: string; displayName: string }[];
  pending: HomeSendItem[];
  history: HomeSendItem[];
  changes: HomeSendChange[];
}) {
  const [uploadState, uploadAction, uploading] = useActionState<SendHomeItemState, FormData>(uploadHomeSendItemAction, {});
  const [pasteState, pasteAction, pasting] = useActionState<SendHomeItemState, FormData>(pasteHomeSendItemAction, {});
  const [routeState, routeAction, routing] = useActionState<RouteHomeItemState, FormData>(routeHomeSendItemAction, {});
  const [dismissState, dismissAction, dismissing] = useActionState<RouteHomeItemState, FormData>(dismissHomeSendItemAction, {});
  const [undoState, undoAction, undoing] = useActionState<RouteHomeItemState, FormData>(undoHomeSendChangeAction, {});

  const [mode, setMode] = useState<"drop" | "paste">("drop");
  const [dragOver, setDragOver] = useState(false);
  const [openItem, setOpenItem] = useState<OpenItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const busy = uploading || pasting;

  // A freshly classified upload or paste becomes the open item to confirm —
  // adjusted during render (React's own pattern for deriving state from a
  // value that changed), not in an effect: each action's own state object
  // is a stable reference until its next submit, so comparing it to the last
  // one this render loop has seen is enough to catch exactly one transition.
  const latestItem = uploadState.item ?? pasteState.item ?? null;
  const [seenItem, setSeenItem] = useState(latestItem);
  if (latestItem !== seenItem) {
    setSeenItem(latestItem);
    if (latestItem) setOpenItem(latestItem);
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

  const prefill = openItem?.extracted ?? null;
  const defaultKind = openItem?.classifiedKind && openItem.classifiedKind !== "unknown" ? openItem.classifiedKind : "grocery_item";
  const pendingOthers = pending.filter((item) => item.id !== openItem?.id);
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
              <p className="text-sm font-medium">Drag a photo or file here</p>
              <p className="mt-0.5 text-xs text-[var(--wh-foreground-subtle)]">A bill, a school notice, a grocery ask — whatever you were sent</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Pill type="button" tone="soft" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  <Camera aria-hidden className="size-3.5" /> {uploading ? "Reading…" : "Choose a photo or file"}
                </Pill>
                <Pill type="button" tone="quiet" onClick={() => setMode(mode === "paste" ? "drop" : "paste")} disabled={busy}>
                  <ClipboardPaste aria-hidden className="size-3.5" /> Paste text instead
                </Pill>
              </div>
            </div>
            <form ref={uploadFormRef} action={uploadAction}>
              <input type="hidden" name="householdId" value={householdId} />
              <input
                ref={fileInputRef}
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={() => uploadFormRef.current?.requestSubmit()}
              />
            </form>
            {uploadState.error ? <Alert>{uploadState.error}</Alert> : null}

            {mode === "paste" ? (
              <form action={pasteAction} className="space-y-3">
                <input type="hidden" name="householdId" value={householdId} />
                {pasteState.error ? <Alert>{pasteState.error}</Alert> : null}
                <label htmlFor="home-send-text" className="block text-sm font-medium">Paste what was forwarded to you</label>
                <textarea
                  id="home-send-text"
                  name="text"
                  rows={5}
                  required
                  placeholder="Paste a bill reminder, a school notice, or a grocery ask…"
                  className="block w-full resize-none rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
                />
                <Pill type="submit" tone="primary" disabled={busy} className="w-full justify-center">
                  {pasting ? "Reading…" : "Read this"}
                </Pill>
              </form>
            ) : null}
          </>
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
              notice={uploadState.notice || pasteState.notice}
              reconciliation={routeState.reconciliation ?? openItem.reconciliation ?? null}
              busy={routing || dismissing}
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
                const presentation = presentationFor(item.classifiedKind);
                const title = item.extracted?.title ?? (item.rawText ? item.rawText.slice(0, 60) : "Something you sent");
                const subtitle = item.securityStatus === "rejected" ? "Couldn't be verified — you can still fill this in by hand" : presentation.label;
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{title}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{subtitle}</span>
                    </span>
                    <Pill
                      type="button"
                      tone="soft"
                      onClick={() => setOpenItem({ id: item.id, classifiedKind: item.classifiedKind ?? "unknown", extracted: item.extracted })}
                    >
                      Review
                    </Pill>
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
                const title = item.extracted?.title ?? (item.rawText ? item.rawText.slice(0, 60) : "Something you sent");
                const itemChanges = changesByIntakeId.get(item.id) ?? [];
                const primaryChange = itemChanges.find((change) => change.domain === item.classifiedKind) ?? itemChanges[0];
                const secondaryChanges = itemChanges.filter((change) => change !== primaryChange);
                // What was actually routed is more trustworthy than
                // classified_kind — a manual override in the confirm form
                // (or, as here, no AI provider ever having classified it at
                // all) can leave classified_kind null while the real change
                // row still says exactly what was written.
                const presentation = presentationFor(primaryChange?.domain ?? item.classifiedKind);
                const canUndoPrimary = Boolean(primaryChange && !primaryChange.undoneAt);
                const statusLabel = item.status === "dismissed" ? "Dismissed" : primaryChange?.undoneAt ? "Undone" : "Added";
                return (
                  <li key={item.id} className="space-y-1.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{title}</span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">{presentation.label}</span>
                      </span>
                      {canUndoPrimary ? (
                        <form action={undoAction}>
                          <input type="hidden" name="householdId" value={householdId} />
                          <input type="hidden" name="changeId" value={primaryChange.id} />
                          <Pill type="submit" tone="quiet" disabled={undoing} aria-label={`Undo adding ${title}`}>
                            {undoing ? "Undoing…" : "Undo"}
                          </Pill>
                        </form>
                      ) : (
                        <Badge tone={statusLabel === "Added" ? "handled" : "neutral"}>{statusLabel}</Badge>
                      )}
                    </div>
                    {secondaryChanges.map((change) => (
                      <div key={change.id} className="ml-11 flex items-center gap-2 text-xs text-[var(--wh-foreground-subtle)]">
                        <ShoppingBasket aria-hidden className="size-3.5 shrink-0" />
                        <span className="flex-1">Also added to Groceries</span>
                        {!change.undoneAt ? (
                          <form action={undoAction}>
                            <input type="hidden" name="householdId" value={householdId} />
                            <input type="hidden" name="changeId" value={change.id} />
                            <Pill type="submit" tone="quiet" disabled={undoing} aria-label="Undo the grocery item">
                              {undoing ? "Undoing…" : "Undo"}
                            </Pill>
                          </form>
                        ) : (
                          <Badge tone="neutral">Undone</Badge>
                        )}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </Card>
          {undoState.error ? <Alert>{undoState.error}</Alert> : null}
        </section>
      ) : null}

      {pending.length === 0 && history.length === 0 ? (
        <EmptyState icon={UploadCloud} tone="ai" title="Nothing sent yet" description="Drag a photo or file above, or paste something you were forwarded, and WonderHome reads it for you." />
      ) : null}
    </div>
  );
}
