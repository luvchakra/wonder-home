"use client";

import { Trash2 } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import type { SchoolItem } from "@wonderhome/core/school/items";
import { localTimeValue, schoolDateValue, schoolTimeWords } from "@wonderhome/core/school/times";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { cancelSchoolItemAction, updateSchoolItemAction } from "../(auth)/school-actions";

const KINDS = [
  { value: "homework", label: "Homework" },
  { value: "worksheet", label: "Worksheet" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "event", label: "Event" },
  { value: "notice", label: "Notice" },
];

/**
 * Everything a piece of school work carries, read from an `ExpandableRow`'s
 * open panel — the same "row opens onto its own edit form" pattern
 * `MemberDetail`/`ResponsibilityRow` already use elsewhere (rule 12: every
 * entity can be updated and removed, not just added).
 */
export function SchoolItemDetail({
  item,
  householdId,
  kids,
  timezone,
  editable,
  onRemoved,
}: {
  item: SchoolItem;
  householdId: string;
  kids: { id: string; displayName: string }[];
  timezone: string;
  editable: boolean;
  onRemoved?: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateSchoolItemAction, {});
  const [kind, setKind] = useState(item.kind);
  const dueRequired = kind !== "notice";

  if (!editable) {
    return (
      <dl className="space-y-2 text-sm">
        <Fact label="For" value={kids.find((kid) => kid.id === item.childMemberId)?.displayName ?? null} />
        <Fact label="Subject" value={item.subject} />
        <Fact label="Time" value={schoolTimeWords(item, timezone)} />
        <Fact label="Notes" value={item.detail} />
        <Fact label="Estimated time" value={item.estimatedMinutes ? `${item.estimatedMinutes} minutes` : null} />
      </dl>
    );
  }

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="itemId" value={item.id} />
        <div className="space-y-1.5">
          <label htmlFor={`for-${item.id}`} className="block text-sm font-medium">For</label>
          <select
            id={`for-${item.id}`}
            name="childMemberId"
            defaultValue={item.childMemberId}
            className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
          >
            {kids.map((kid) => (
              <option key={kid.id} value={kid.id}>{kid.displayName}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`kind-${item.id}`} className="block text-sm font-medium">Kind</label>
          <select
            id={`kind-${item.id}`}
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as SchoolItem["kind"])}
            className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        <Field label="What is it?" name="title" required defaultValue={item.title} autoComplete="off" />
        <Field label="Subject (optional)" name="subject" defaultValue={item.subject ?? ""} autoComplete="off" />
        <Field label="Notes (optional)" name="detail" defaultValue={item.detail ?? ""} autoComplete="off" />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={dueRequired ? "Due" : "Due (optional)"}
            name="dueAt"
            type="date"
            required={dueRequired}
            defaultValue={schoolDateValue(item, timezone)}
            hint={dueRequired ? undefined : "A notice does not need a date of its own."}
          />
          <Field label="Est. minutes (optional)" name="estimatedMinutes" type="number" min={1} defaultValue={item.estimatedMinutes ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts (optional)" name="dueTime" type="time" defaultValue={item.dueTimeKnown ? localTimeValue(item.dueAt, timezone) : ""} hint="Leave empty for all day." />
          <Field label="Ends (optional)" name="endTime" type="time" defaultValue={item.endsAt ? localTimeValue(item.endsAt, timezone) : ""} />
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      <CancelSchoolItemControl householdId={householdId} itemId={item.id} title={item.title} onRemoved={onRemoved} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function CancelSchoolItemControl({
  householdId,
  itemId,
  title,
  onRemoved,
}: {
  householdId: string;
  itemId: string;
  title: string;
  onRemoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(cancelSchoolItemAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      setOpen(false);
      onRemoved?.();
    }
  }, [pending, state.error, onRemoved]);

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="text-[var(--wh-risk)]">
        <Trash2 aria-hidden className="size-3.5" /> Remove
      </Pill>

      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${title}?`}
        description="WonderHome stops tracking it and it drops off the deadline list. This does not undo anything already turned in."
        confirmLabel="Remove"
        destructive
        pending={pending}
        onConfirm={() => {
          submitted.current = true;
          const formData = new FormData();
          formData.set("householdId", householdId);
          formData.set("itemId", itemId);
          startTransition(() => formAction(formData));
        }}
      >
        {state.error ? <p className="text-sm text-[var(--wh-risk)]">{state.error}</p> : null}
      </ConfirmationSheet>
    </>
  );
}
