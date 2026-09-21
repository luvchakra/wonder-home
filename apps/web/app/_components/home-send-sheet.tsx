"use client";

import { Camera, ClipboardPaste, Sparkles } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import {
  dismissHomeSendItemAction,
  pasteHomeSendItemAction,
  routeHomeSendItemAction,
  uploadHomeSendItemAction,
  type RouteHomeItemState,
  type SendHomeItemState,
} from "../(auth)/home-send-actions";

const OBLIGATION_KIND_OPTIONS = [
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

const SCHOOL_KIND_OPTIONS = [
  { value: "homework", label: "Homework" },
  { value: "worksheet", label: "Worksheet" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "event", label: "Event" },
  { value: "notice", label: "Notice" },
];

const KIND_OPTIONS = [
  { value: "bill", label: "A bill" },
  { value: "school_item", label: "School work" },
  { value: "grocery_item", label: "A grocery item" },
];

const selectClass =
  "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";

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
}: {
  householdId: string;
  kids: { id: string; displayName: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<"choose" | "upload" | "paste">("choose");
  const [uploadState, uploadAction, uploading] = useActionState<SendHomeItemState, FormData>(uploadHomeSendItemAction, {});
  const [pasteState, pasteAction, pasting] = useActionState<SendHomeItemState, FormData>(pasteHomeSendItemAction, {});
  const [routeState, routeAction, routing] = useActionState<RouteHomeItemState, FormData>(routeHomeSendItemAction, {});
  const [dismissState, dismissAction, dismissing] = useActionState<RouteHomeItemState, FormData>(dismissHomeSendItemAction, {});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);

  const item = uploadState.item ?? pasteState.item ?? null;
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
    if (!next) setMode("choose");
  };

  const prefill = item?.extracted ?? null;
  const defaultKind = item?.classifiedKind && item.classifiedKind !== "unknown" ? item.classifiedKind : "grocery_item";

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      title="Send something to WonderHome"
      description="A photo, a file, or a message you've been forwarded — WonderHome reads it and asks you to confirm before anything is added."
    >
      <div className="space-y-4">
        {!item ? (
          mode === "choose" ? (
            <div className="grid grid-cols-2 gap-3">
              <Pill type="button" tone="quiet" onClick={() => setMode("upload")} className="w-full justify-center py-3">
                <Camera aria-hidden className="size-4" /> Upload a photo
              </Pill>
              <Pill type="button" tone="quiet" onClick={() => setMode("paste")} className="w-full justify-center py-3">
                <ClipboardPaste aria-hidden className="size-4" /> Paste text
              </Pill>
            </div>
          ) : mode === "upload" ? (
            <form ref={uploadFormRef} action={uploadAction} className="space-y-3">
              <input type="hidden" name="householdId" value={householdId} />
              {uploadState.error ? <Alert>{uploadState.error}</Alert> : null}
              <input
                ref={fileInputRef}
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={() => uploadFormRef.current?.requestSubmit()}
              />
              <Pill type="button" tone="quiet" onClick={() => fileInputRef.current?.click()} disabled={busy} className="w-full justify-center py-3">
                {uploading ? "Reading…" : "Choose a photo or file"}
              </Pill>
              <Pill type="button" tone="quiet" onClick={() => setMode("choose")} disabled={busy} className="w-full justify-center">
                Back
              </Pill>
            </form>
          ) : (
            <form action={pasteAction} className="space-y-3">
              <input type="hidden" name="householdId" value={householdId} />
              {pasteState.error ? <Alert>{pasteState.error}</Alert> : null}
              <label htmlFor="home-send-text" className="block text-sm font-medium">
                Paste what was forwarded to you
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
        ) : (
          <ConfirmStep
            key={item.id}
            item={item}
            defaultKind={defaultKind}
            prefill={prefill}
            kids={kids}
            householdId={householdId}
            routeAction={routeAction}
            routeError={routeState.error}
            notice={uploadState.notice || pasteState.notice}
            busy={routing || dismissing}
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

type Extraction = {
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
} | null;

/**
 * The confirm form for one classified item. Keyed by `item.id` from its
 * parent, so a freshly classified item gets its own fresh `kind` state on
 * mount rather than one reset by an effect.
 */
function ConfirmStep({
  item,
  defaultKind,
  prefill,
  kids,
  householdId,
  routeAction,
  routeError,
  notice,
  busy,
}: {
  item: { id: string };
  defaultKind: string;
  prefill: Extraction;
  kids: { id: string; displayName: string }[];
  householdId: string;
  routeAction: (formData: FormData) => void;
  routeError?: string;
  notice?: string;
  busy: boolean;
}) {
  const [kind, setKind] = useState(defaultKind);

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

      <div className="space-y-1.5">
        <label htmlFor="kind" className="block text-sm font-medium">This is</label>
        <select id="kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value)} className={selectClass}>
          {KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <ConfirmFields kind={kind} prefill={prefill} kids={kids} />

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
function ConfirmFields({ kind, prefill, kids }: { kind: string; prefill: Extraction; kids: { id: string; displayName: string }[] }) {
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
