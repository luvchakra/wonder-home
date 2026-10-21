"use client";

import { Camera, Plus } from "lucide-react";
import { startTransition, useActionState, useRef, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import {
  createSchoolItemAction,
  extractSchoolItemFromPhotoAction,
  type ExtractedSchoolItem,
  type ExtractSchoolItemState,
  type SchoolItemActionState,
} from "../(auth)/school-actions";

const KINDS = ["homework", "worksheet", "exam", "project", "event", "notice"] as const;
type Kind = (typeof KINDS)[number];

/**
 * The school sheets' words in the viewer's language, built on the server by
 * `schoolFormLabels` (story 22-004). `{name}` and `{minutes}` stay
 * placeholders, filled in here with the item's own title and its minutes; a
 * kind's label is only ever shown — the stored value stays the enum.
 */
export type SchoolFormLabels = {
  kinds: Record<Kind, string>;
  add: string;
  title: string;
  description: string;
  readingPhoto: string;
  /** "This may already be on the calendar:", and the button that adds it anyway. */
  duplicate: string;
  addAnyway: string;
  fromScreenshot: string;
  for: string;
  kind: string;
  what: string;
  whatPlaceholder: string;
  subject: string;
  subjectPlaceholder: string;
  notes: string;
  due: string;
  dueOptional: string;
  noticeHint: string;
  minutes: string;
  starts: string;
  allDayHint: string;
  ends: string;
  submit: string;
  adding: string;
  save: string;
  saving: string;
  factSubject: string;
  factTime: string;
  factNotes: string;
  factEstimate: string;
  /** "{minutes} minutes" in each plural form the viewer's language has, keyed by `Intl.PluralRules` category. */
  minuteForms: Record<string, string>;
  /** The viewer's language, for choosing among `minuteForms`. */
  language: string;
  remove: string;
  removeTitle: string;
  removeDescription: string;
};

/**
 * "Add a piece of homework" as a sheet — the manual half of "Connect
 * school", now with a screenshot as a second way in (item 6): a photo fills
 * the same form below rather than creating anything on its own, so a
 * misread gets caught by the household reviewing the fields before Add,
 * exactly the same trust level typing them in by hand already has.
 */
export function AddHomeworkButton({ householdId, kids, labels, defaultChildId }: { householdId: string; kids: { id: string; displayName: string }[]; labels: SchoolFormLabels; /** The child picked on the screen, chosen in the form to start with. */ defaultChildId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SchoolItemActionState, FormData>(createSchoolItemAction, {});
  const [extractState, extractAction, extracting] = useActionState<ExtractSchoolItemState, FormData>(extractSchoolItemFromPhotoAction, {});
  const prefill = extractState.extracted ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractFormRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {labels.add}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={labels.title} description={labels.description}>
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
              <Camera aria-hidden className="size-3.5" /> {extracting ? labels.readingPhoto : labels.fromScreenshot}
            </Pill>
          </form>
          {extractState.error ? <Alert>{extractState.error}</Alert> : null}
          {extractState.notice ? <Alert tone="info">{extractState.notice}</Alert> : null}

          <AddHomeworkForm
            key={prefill ? JSON.stringify(prefill) : "blank"}
            householdId={householdId}
            kids={kids}
            defaultChildId={defaultChildId}
            prefill={prefill}
            state={state}
            formAction={formAction}
            pending={pending}
            labels={labels}
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
  defaultChildId,
  prefill,
  state,
  formAction,
  pending,
  labels,
}: {
  householdId: string;
  kids: { id: string; displayName: string }[];
  defaultChildId?: string | null;
  prefill: ExtractedSchoolItem | null;
  state: SchoolItemActionState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  labels: SchoolFormLabels;
}) {
  const [kind, setKind] = useState<Kind>(prefill?.kind ?? "homework");
  const dueRequired = kind !== "notice";
  // A duplicate answers the details as they were sent; editing after it asks again.
  const [editedAfter, setEditedAfter] = useState<SchoolItemActionState | null>(null);
  const duplicate = editedAfter === state ? null : (state.duplicate ?? null);

  return (
    <form
          onSubmit={(event) => {
            // Submitted by hand rather than as a form action, so a question
            // back (a clash, something already on the calendar) keeps what was
            // typed and "Add anyway" sends it again, instead of a reset form.
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(() => formAction(data));
          }}
          onChange={() => setEditedAfter(state)}
          className="space-y-3"
        >
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      {duplicate ? (
        <Alert>
          <span className="block font-medium">{labels.duplicate}</span>
          <ul className="mt-1 list-disc ps-5">
            <li>{duplicate}</li>
          </ul>
          <input type="hidden" name="confirmDuplicate" value="on" />
        </Alert>
      ) : null}
      <input type="hidden" name="householdId" value={householdId} />
      <div className="space-y-1.5">
        <label htmlFor="childMemberId" className="block text-sm font-medium">{labels.for}</label>
        <select
          id="childMemberId"
          name="childMemberId"
          defaultValue={defaultChildId ?? undefined}
          className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
        >
          {kids.map((child) => (
            <option key={child.id} value={child.id}>{child.displayName}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="kind" className="block text-sm font-medium">{labels.kind}</label>
        <select
          id="kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as Kind)}
          className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
        >
          {KINDS.map((value) => (
            <option key={value} value={value}>{labels.kinds[value]}</option>
          ))}
        </select>
      </div>
      <Field label={labels.what} name="title" required defaultValue={prefill?.title ?? ""} placeholder={labels.whatPlaceholder} autoComplete="off" />
      <Field label={labels.subject} name="subject" defaultValue={prefill?.subject ?? ""} placeholder={labels.subjectPlaceholder} autoComplete="off" />
      <Field label={labels.notes} name="detail" defaultValue={prefill?.notes ?? ""} autoComplete="off" />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={dueRequired ? labels.due : labels.dueOptional}
          name="dueAt"
          type="date"
          required={dueRequired}
          defaultValue={prefill?.dueDate ?? ""}
          hint={dueRequired ? undefined : labels.noticeHint}
        />
        <Field label={labels.minutes} name="estimatedMinutes" type="number" min={1} placeholder="30" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={labels.starts} name="dueTime" type="time" hint={labels.allDayHint} />
        <Field label={labels.ends} name="endTime" type="time" />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? labels.adding : duplicate ? labels.addAnyway : labels.submit}
      </Button>
    </form>
  );
}
