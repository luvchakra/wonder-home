"use client";

import { Camera, ClipboardPaste } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { ACCEPTED_UPLOAD_TYPES } from "@wonderhome/core/homesend/normalize";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import {
  confirmTranscriptAction,
  dismissHomeSendItemAction,
  pasteHomeSendItemAction,
  routeHomeSendItemAction,
  uploadHomeSendItemAction,
  type RouteHomeItemState,
  type SendHomeItemState,
} from "../(auth)/home-send-actions";
import { HomeSendConfirmStep, TranscriptCheck } from "./home-send-intake";

/**
 * HomeSend v1: the "send something to WonderHome" step of the pipeline the
 * architecture diagram describes (Inputs -> Intake -> Understand -> ...).
 *
 * Opened from the composer's paperclip button (one door, a second modality —
 * rule 13), never a shortcut of its own. Three stages in one sheet: choose
 * how you're sending it, review what WonderHome read, confirm into the real
 * domain table — the same never-write-without-review shape
 * `AddHomeworkButton`'s screenshot import already uses.
 */
export function HomeSendSheet({
  householdId,
  kids,
  open,
  onOpenChange,
  canAddChild = false,
}: {
  householdId: string;
  kids: { id: string; displayName: string }[];
  /** Whether the viewer may add a child from a school notice (story 08-009). */
  canAddChild?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<"choose" | "upload" | "paste">("choose");
  const [uploadState, uploadAction, uploading] = useActionState<SendHomeItemState, FormData>(uploadHomeSendItemAction, {});
  const [pasteState, pasteAction, pasting] = useActionState<SendHomeItemState, FormData>(pasteHomeSendItemAction, {});
  const [routeState, routeAction, routing] = useActionState<RouteHomeItemState, FormData>(routeHomeSendItemAction, {});
  const [dismissState, dismissAction, dismissing] = useActionState<RouteHomeItemState, FormData>(dismissHomeSendItemAction, {});
  const [transcriptState, transcriptAction, confirmingTranscript] = useActionState<SendHomeItemState, FormData>(confirmTranscriptAction, {});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);

  // The newest outcome wins: a confirmed transcript replaces the voice note
  // it came from. A failed-safely outcome opens nothing — it is kept in
  // HomeSend's own "Failed safely" list, and the sheet says so.
  const [latest, setLatest] = useState<SendHomeItemState>({});
  const [seen, setSeen] = useState([uploadState, pasteState, transcriptState]);
  const fresh = [uploadState, pasteState, transcriptState].find((state, index) => state !== seen[index]);
  if (fresh) {
    setSeen([uploadState, pasteState, transcriptState]);
    setLatest(fresh);
  }
  // Routing or dismissing ends this item; the next time the sheet opens it
  // starts fresh rather than showing what was just handled.
  const closed = routeState.notice ?? dismissState.notice ?? null;
  const [seenClosed, setSeenClosed] = useState(closed);
  if (closed !== seenClosed) {
    setSeenClosed(closed);
    if (closed) {
      setLatest({});
      setMode("choose");
    }
  }
  const outcome = latest;
  const failedNotice = outcome.state === "failed" ? outcome.notice : null;
  // Applied on its own under the household's autonomy setting (§12).
  const appliedNotice = outcome.autoApplied ? outcome.notice : null;
  const item = outcome.state === "failed" ? null : (outcome.item ?? null);
  const checkTranscript = outcome.state === "check_transcript" && outcome.heard ? outcome.heard : null;
  const busy = uploading || pasting;

  // A routed or dismissed item closes the sheet and resets it for next time.
  useEffect(() => {
    if (routeState.notice || dismissState.notice) {
      onOpenChange(false);
    }
  }, [routeState.notice, dismissState.notice, onOpenChange]);

  // Closing (backdrop, Escape, or the routed/dismissed effect above) resets
  // the sheet's own step for next time — set here, at the point of closing,
  // rather than derived from `open` in a second effect.
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setMode("choose");
      setLatest({});
    }
  };

  const prefill = item?.extracted ?? null;
  const defaultKind = item?.classifiedKind && item.classifiedKind !== "unknown" ? item.classifiedKind : "grocery_item";

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      title="Send something to WonderHome"
      description="A photo, a PDF, a voice note, a link or a message you've been forwarded — WonderHome reads it and asks you to confirm before anything is added."
    >
      <div className="space-y-4">
        {!item ? (
          mode === "choose" ? (
            <div className="grid grid-cols-2 gap-3">
              <Pill type="button" tone="quiet" onClick={() => setMode("upload")} className="w-full justify-center py-3">
                <Camera aria-hidden className="size-4" /> Send a file
              </Pill>
              <Pill type="button" tone="quiet" onClick={() => setMode("paste")} className="w-full justify-center py-3">
                <ClipboardPaste aria-hidden className="size-4" /> Paste text
              </Pill>
            </div>
          ) : mode === "upload" ? (
            <form ref={uploadFormRef} action={uploadAction} className="space-y-3">
              <input type="hidden" name="householdId" value={householdId} />
              {uploadState.error ? <Alert>{uploadState.error}</Alert> : null}
              {failedNotice ? <Alert>{failedNotice} It&apos;s kept in HomeSend under &ldquo;Failed safely&rdquo;.</Alert> : null}
              {appliedNotice ? <Alert tone="info">{appliedNotice} It&apos;s under &ldquo;Recently handled&rdquo; in HomeSend.</Alert> : null}
              <input
                ref={fileInputRef}
                type="file"
                name="photo"
                accept={ACCEPTED_UPLOAD_TYPES}
                className="sr-only"
                onChange={() => uploadFormRef.current?.requestSubmit()}
              />
              <Pill type="button" tone="quiet" onClick={() => fileInputRef.current?.click()} disabled={busy} className="w-full justify-center py-3">
                {uploading ? "Reading…" : "Choose a photo, PDF or voice note"}
              </Pill>
              <Pill type="button" tone="quiet" onClick={() => setMode("choose")} disabled={busy} className="w-full justify-center">
                Back
              </Pill>
            </form>
          ) : (
            <form action={pasteAction} className="space-y-3">
              <input type="hidden" name="householdId" value={householdId} />
              {pasteState.error ? <Alert>{pasteState.error}</Alert> : null}
              {failedNotice ? <Alert>{failedNotice} It&apos;s kept in HomeSend under &ldquo;Failed safely&rdquo;.</Alert> : null}
              {appliedNotice ? <Alert tone="info">{appliedNotice} It&apos;s under &ldquo;Recently handled&rdquo; in HomeSend.</Alert> : null}
              <label htmlFor="home-send-text" className="block text-sm font-medium">
                Paste a forwarded message, or a link
              </label>
              <textarea
                id="home-send-text"
                name="text"
                rows={6}
                required
                placeholder="Paste a bill reminder, a school notice, or a grocery ask…"
                className="block w-full resize-none rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
              />
              <Button type="submit" disabled={busy} className="w-full">
                {pasting ? "Reading…" : "Read this"}
              </Button>
              <Pill type="button" tone="quiet" onClick={() => setMode("choose")} disabled={busy} className="w-full justify-center">
                Back
              </Pill>
            </form>
          )
        ) : checkTranscript ? (
          <TranscriptCheck
            key={item.id}
            householdId={householdId}
            itemId={item.id}
            heard={checkTranscript}
            action={transcriptAction}
            error={transcriptState.error}
            busy={confirmingTranscript}
          />
        ) : (
          <HomeSendConfirmStep
            key={item.id}
            item={item}
            defaultKind={defaultKind}
            prefill={prefill}
            kids={kids}
            canAddChild={canAddChild}
            householdId={householdId}
            routeAction={routeAction}
            routeError={routeState.error}
            notice={outcome.notice}
            reconciliation={routeState.reconciliation ?? item.reconciliation ?? null}
            busy={routing || dismissing}
            understanding={item.understanding}
            receivedAt={new Date().toISOString()}
            subject={item.subject ?? null}
            confirmation={item.confirmation ?? null}
          />
        )}

        {item ? (
          <form action={dismissAction}>
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="itemId" value={item.id} />
            <Pill type="submit" tone="quiet" disabled={routing || dismissing} className="w-full justify-center">
              {dismissing ? "Dismissing…" : "Not worth adding"}
            </Pill>
          </form>
        ) : null}
        {dismissState.error ? <Alert>{dismissState.error}</Alert> : null}
      </div>
    </Sheet>
  );
}
