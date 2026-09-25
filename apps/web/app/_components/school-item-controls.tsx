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
import type { SchoolFormLabels } from "./school-forms";

const KINDS = ["homework", "worksheet", "exam", "project", "event", "notice"] as const satisfies readonly SchoolItem["kind"][];

const withName = (template: string, name: string) => template.replace("{name}", () => name);

/** "{minutes} minutes" in the viewer's own plural form (the forms themselves come from the server). */
function minutesWords(labels: SchoolFormLabels, minutes: number): string {
  let category = "other";
  try {
    category = new Intl.PluralRules(labels.language).select(minutes);
  } catch {
    // An unknown language reads the "other" form.
  }
  const template = labels.minuteForms[category] ?? labels.minuteForms.other ?? "{minutes}";
  return template.replace("{minutes}", () => String(minutes));
}

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
  labels,
}: {
  item: SchoolItem;
  householdId: string;
  kids: { id: string; displayName: string }[];
  timezone: string;
  editable: boolean;
  onRemoved?: () => void;
  labels: SchoolFormLabels;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateSchoolItemAction, {});
  const [kind, setKind] = useState(item.kind);
  const dueRequired = kind !== "notice";

  if (!editable) {
    return (
      <dl className="space-y-2 text-sm">
        <Fact label={labels.for} value={kids.find((kid) => kid.id === item.childMemberId)?.displayName ?? null} />
        <Fact label={labels.factSubject} value={item.subject} />
        <Fact label={labels.factTime} value={schoolTimeWords(item, timezone)} />
        <Fact label={labels.factNotes} value={item.detail} />
        <Fact label={labels.factEstimate} value={item.estimatedMinutes ? minutesWords(labels, item.estimatedMinutes) : null} />
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
          <label htmlFor={`for-${item.id}`} className="block text-sm font-medium">{labels.for}</label>
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
          <label htmlFor={`kind-${item.id}`} className="block text-sm font-medium">{labels.kind}</label>
          <select
            id={`kind-${item.id}`}
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as SchoolItem["kind"])}
            className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>{labels.kinds[value]}</option>
            ))}
          </select>
        </div>
        <Field label={labels.what} name="title" required defaultValue={item.title} autoComplete="off" />
        <Field label={labels.subject} name="subject" defaultValue={item.subject ?? ""} autoComplete="off" />
        <Field label={labels.notes} name="detail" defaultValue={item.detail ?? ""} autoComplete="off" />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={dueRequired ? labels.due : labels.dueOptional}
            name="dueAt"
            type="date"
            required={dueRequired}
            defaultValue={schoolDateValue(item, timezone)}
            hint={dueRequired ? undefined : labels.noticeHint}
          />
          <Field label={labels.minutes} name="estimatedMinutes" type="number" min={1} defaultValue={item.estimatedMinutes ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={labels.starts} name="dueTime" type="time" defaultValue={item.dueTimeKnown ? localTimeValue(item.dueAt, timezone) : ""} hint={labels.allDayHint} />
          <Field label={labels.ends} name="endTime" type="time" defaultValue={item.endsAt ? localTimeValue(item.endsAt, timezone) : ""} />
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? labels.saving : labels.save}
        </Button>
      </form>
      <CancelSchoolItemControl householdId={householdId} itemId={item.id} title={item.title} onRemoved={onRemoved} labels={labels} />
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
  labels,
}: {
  householdId: string;
  itemId: string;
  title: string;
  onRemoved?: () => void;
  labels: SchoolFormLabels;
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
        <Trash2 aria-hidden className="size-3.5" /> {labels.remove}
      </Pill>

      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={withName(labels.removeTitle, title)}
        description={labels.removeDescription}
        confirmLabel={labels.remove}
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
