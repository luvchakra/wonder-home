"use client";

import { Camera, Plus } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  createSchoolItemAction,
  extractSchoolItemFromPhotoAction,
  type ExtractedSchoolItem,
  type ExtractSchoolItemState,
} from "../(auth)/school-actions";

const KINDS = [
  { value: "homework", label: "Homework" },
  { value: "worksheet", label: "Worksheet" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "event", label: "Event" },
  { value: "notice", label: "Notice" },
] as const;

/**
 * "Add a piece of homework" as a sheet — the manual half of "Connect
 * school", now with a screenshot as a second way in (item 6): a photo fills
 * the same form below rather than creating anything on its own, so a
 * misread gets caught by the household reviewing the fields before Add,
 * exactly the same trust level typing them in by hand already has.
 */
export function AddHomeworkButton({ householdId, kids }: { householdId: string; kids: { id: string; displayName: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createSchoolItemAction, {});
  const [extractState, extractAction, extracting] = useActionState<ExtractSchoolItemState, FormData>(extractSchoolItemFromPhotoAction, {});
  const prefill = extractState.extracted ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractFormRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Add homework
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Add a piece of school work" description="WonderHome tracks it against its due date from here — no portal needed.">
        <div className="space-y-4">
          <form ref={extractFormRef} action={extractAction}>
            <input type="hidden" name="householdId" value={householdId} />
            <input
              ref={fileInputRef}
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={() => extractFormRef.current?.requestSubmit()}
            />
            <Pill type="button" tone="quiet" onClick={() => fileInputRef.current?.click()} disabled={extracting} className="w-full justify-center">
              <Camera aria-hidden className="size-3.5" /> {extracting ? "Reading photo…" : "Upload a screenshot instead"}
            </Pill>
          </form>
          {extractState.error ? <Alert>{extractState.error}</Alert> : null}
          {extractState.notice ? <Alert tone="info">{extractState.notice}</Alert> : null}

          <AddHomeworkForm
            key={prefill ? JSON.stringify(prefill) : "blank"}
            householdId={householdId}
            kids={kids}
            prefill={prefill}
            state={state}
            formAction={formAction}
            pending={pending}
          />
        </div>
      </Sheet>
    </>
  );
}

/**
 * The create form's actual fields, remounted (via the caller's `key`) each
 * time a fresh photo extraction lands — which is also what lets `kind`
 * start from the extracted value with plain `useState` instead of an effect
 * that would fight the form's own remount.
 */
function AddHomeworkForm({
  householdId,
  kids,
  prefill,
  state,
  formAction,
  pending,
}: {
  householdId: string;
  kids: { id: string; displayName: string }[];
  prefill: ExtractedSchoolItem | null;
  state: ActionState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>(prefill?.kind ?? "homework");
  const dueRequired = kind !== "notice";

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      <div className="space-y-1.5">
        <label htmlFor="childMemberId" className="block text-sm font-medium">For</label>
        <select
          id="childMemberId"
          name="childMemberId"
          className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
        >
          {kids.map((child) => (
            <option key={child.id} value={child.id}>{child.displayName}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="kind" className="block text-sm font-medium">Kind</label>
        <select
          id="kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as (typeof KINDS)[number]["value"])}
          className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
      </div>
      <Field label="What is it?" name="title" required defaultValue={prefill?.title ?? ""} placeholder="Maths worksheet, chapter 4" autoComplete="off" />
      <Field label="Subject (optional)" name="subject" defaultValue={prefill?.subject ?? ""} placeholder="Maths" autoComplete="off" />
      <Field label="Notes (optional)" name="detail" defaultValue={prefill?.notes ?? ""} autoComplete="off" />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={dueRequired ? "Due" : "Due (optional)"}
          name="dueAt"
          type="date"
          required={dueRequired}
          defaultValue={prefill?.dueDate ?? ""}
          hint={dueRequired ? undefined : "A notice does not need a date of its own."}
        />
        <Field label="Est. minutes (optional)" name="estimatedMinutes" type="number" min={1} placeholder="30" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts (optional)" name="dueTime" type="time" hint="Leave empty for all day." />
        <Field label="Ends (optional)" name="endTime" type="time" />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
