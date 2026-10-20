"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition, type FormEvent } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { removeSchoolRecordAction, saveExamAction, savePaperAction, savePeriodAction } from "../(auth)/school-actions";

/** Every word a child's timetable and exams need, in the reader's language (built on the server, 08-015). */
export type SchoolWeekWords = {
  saving: string;
  addNew: string;
  chooseExisting: string;
  /** Monday first, as ISO weekdays 1…7. */
  dayNames: string[];
  subjects: string[];
  timetable: {
    add: string;
    sheetAdd: string;
    sheetEdit: string;
    edit: string;
    remove: string;
    day: string;
    subject: string;
    startsAt: string;
    endsAt: string;
    teacher: string;
    noTeacher: string;
    room: string;
    save: string;
  };
  exams: {
    add: string;
    sheetAdd: string;
    sheetEdit: string;
    edit: string;
    remove: string;
    type: string;
    /** The app's types and the household's own, by stored name, with the words to show. */
    types: string[];
    typeLabels: Record<string, string>;
    titleField: string;
    titlePlaceholder: string;
    notes: string;
    save: string;
    calendarHint: string;
  };
  paper: {
    add: string;
    sheetAdd: string;
    sheetEdit: string;
    edit: string;
    remove: string;
    subject: string;
    onDate: string;
    startsAt: string;
    endsAt: string;
    syllabus: string;
    syllabusPlaceholder: string;
    links: string;
    linksHint: string;
    save: string;
  };
};

export type PeriodValue = { id: string; weekday: number; startsAt: string; endsAt: string; subject: string; teacherName: string | null; room: string | null };
export type ExamValue = { id: string; examType: string; title: string | null; notes: string | null };
export type PaperValue = { id: string; subject: string; onDate: string; startsAt: string | null; endsAt: string | null; syllabus: string | null; links: string[] };

const ICON_BUTTON =
  "grid size-9 place-items-center rounded-full text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50";
const ADD_LINK =
  "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--wh-radius-pill)] px-2 text-sm font-semibold text-[var(--wh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]";
const TEXTAREA = "block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base";

const named = (template: string, name: string) => template.replaceAll("{name}", name);

/**
 * A form in a sheet that closes once its save goes through. Submitted by
 * hand rather than as a form action, so a refused save ("not a web address")
 * keeps everything the person typed instead of resetting the form.
 */
function useSheetForm(action: (previous: ActionState, data: FormData) => Promise<ActionState>) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, data) => {
    const result = await action(previous, data);
    if (!result.error) setOpen(false);
    return result;
  }, {});
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };
  return { open, setOpen, state, submit, pending };
}

function SaveButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** The trigger: a quiet "+ Add …" link, or a pencil with its own label (rule 11). */
function Trigger({ editing, label, onClick }: { editing: boolean; label: string; onClick: () => void }) {
  return editing ? (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={ICON_BUTTON}>
      <Pencil aria-hidden className="size-4" />
    </button>
  ) : (
    <button type="button" onClick={onClick} className={ADD_LINK}>
      <Plus aria-hidden className="size-4" /> {label}
    </button>
  );
}

/** A period, an exam or a subject of one, stood down (kept, not deleted), as an icon with its own label. */
export function RemoveSchoolRecord({ kind, householdId, id, label }: { kind: "period" | "exam" | "paper"; householdId: string; id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={label}
        title={error ?? label}
        className={ICON_BUTTON}
        onClick={() =>
          startTransition(async () => {
            const result = await removeSchoolRecordAction({ householdId, id, kind });
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {error ? <span role="alert" className="sr-only">{error}</span> : null}
    </>
  );
}

/** One period of a child's school week, added or changed (08-015). */
export function PeriodSheet({
  householdId,
  child,
  period,
  weekday,
  teachers = [],
  words,
}: {
  householdId: string;
  child: { id: string; name: string };
  period?: PeriodValue;
  weekday?: number;
  /** The child's teachers on record, picked rather than typed (the owner, 2026-10-20); a new one can still be added here. */
  teachers?: string[];
  words: SchoolWeekWords;
}) {
  const { open, setOpen, state, submit, pending } = useSheetForm(savePeriodAction);
  const w = words.timetable;
  return (
    <>
      <Trigger editing={Boolean(period)} label={period ? named(w.edit, period.subject) : w.add} onClick={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen} title={period ? named(w.sheetEdit, period.subject) : named(w.sheetAdd, child.name)}>
        <form onSubmit={submit} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="childMemberId" value={child.id} />
          <input type="hidden" name="id" value={period?.id ?? ""} />
          <Select label={w.day} name="weekday" defaultValue={String(period?.weekday ?? weekday ?? 1)}>
            {words.dayNames.map((day, index) => (
              <option key={day} value={index + 1}>
                {day}
              </option>
            ))}
          </Select>
          <ComboboxField
            label={w.subject}
            name="subject"
            required
            options={words.subjects}
            defaultValue={period?.subject ?? undefined}
            addNewLabel={words.addNew}
            chooseExistingLabel={words.chooseExisting}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label={w.startsAt} name="startsAt" type="time" required defaultValue={period?.startsAt ?? ""} />
            <Field label={w.endsAt} name="endsAt" type="time" required defaultValue={period?.endsAt ?? ""} />
          </div>
          <ComboboxField
            label={w.teacher}
            name="teacherName"
            options={teachers}
            defaultValue={period?.teacherName ?? undefined}
            emptyLabel={w.noTeacher}
            addNewLabel={words.addNew}
            chooseExistingLabel={words.chooseExisting}
          />
          <Field label={w.room} name="room" defaultValue={period?.room ?? ""} autoComplete="off" maxLength={60} />
          <SaveButton pending={pending} label={w.save} pendingLabel={words.saving} />
        </form>
      </Sheet>
    </>
  );
}

/** An exam for a child, added or changed: its kind (picked, or the household's own), a name and notes. */
export function ExamSheet({ householdId, child, exam, words }: { householdId: string; child: { id: string; name: string }; exam?: ExamValue; words: SchoolWeekWords }) {
  const { open, setOpen, state, submit, pending } = useSheetForm(saveExamAction);
  const w = words.exams;
  const label = exam ? (w.typeLabels[exam.examType] ?? exam.examType) : "";
  return (
    <>
      <Trigger editing={Boolean(exam)} label={exam ? named(w.edit, label) : w.add} onClick={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen} title={exam ? named(w.sheetEdit, label) : named(w.sheetAdd, child.name)} description={w.calendarHint}>
        <form onSubmit={submit} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="childMemberId" value={child.id} />
          <input type="hidden" name="id" value={exam?.id ?? ""} />
          <ComboboxField
            label={w.type}
            name="examType"
            required
            options={w.types}
            optionLabels={w.typeLabels}
            defaultValue={exam?.examType ?? w.types[0]}
            addNewLabel={words.addNew}
            chooseExistingLabel={words.chooseExisting}
          />
          <Field label={w.titleField} name="title" defaultValue={exam?.title ?? ""} placeholder={w.titlePlaceholder} autoComplete="off" maxLength={120} />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{w.notes}</span>
            <textarea name="notes" rows={2} maxLength={2000} defaultValue={exam?.notes ?? ""} className={TEXTAREA} />
          </label>
          <SaveButton pending={pending} label={w.save} pendingLabel={words.saving} />
        </form>
      </Sheet>
    </>
  );
}

/** One subject of an exam, added or changed: its day and time, what it covers, and links to material. */
export function PaperSheet({ householdId, exam, paper, words }: { householdId: string; exam: { id: string; name: string }; paper?: PaperValue; words: SchoolWeekWords }) {
  const { open, setOpen, state, submit, pending } = useSheetForm(savePaperAction);
  const w = words.paper;
  return (
    <>
      <Trigger editing={Boolean(paper)} label={paper ? named(w.edit, paper.subject) : w.add} onClick={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen} title={paper ? named(w.sheetEdit, paper.subject) : named(w.sheetAdd, exam.name)} description={words.exams.calendarHint}>
        <form onSubmit={submit} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="examId" value={exam.id} />
          <input type="hidden" name="id" value={paper?.id ?? ""} />
          <ComboboxField
            label={w.subject}
            name="subject"
            required
            options={words.subjects}
            defaultValue={paper?.subject ?? undefined}
            addNewLabel={words.addNew}
            chooseExistingLabel={words.chooseExisting}
          />
          <Field label={w.onDate} name="onDate" type="date" required defaultValue={paper?.onDate ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={w.startsAt} name="startsAt" type="time" defaultValue={paper?.startsAt ?? ""} />
            <Field label={w.endsAt} name="endsAt" type="time" defaultValue={paper?.endsAt ?? ""} />
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{w.syllabus}</span>
            <textarea name="syllabus" rows={3} maxLength={4000} defaultValue={paper?.syllabus ?? ""} placeholder={w.syllabusPlaceholder} className={TEXTAREA} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{w.links}</span>
            <textarea name="links" rows={2} defaultValue={paper?.links.join("\n") ?? ""} placeholder="https://" inputMode="url" className={TEXTAREA} />
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">{w.linksHint}</span>
          </label>
          <SaveButton pending={pending} label={w.save} pendingLabel={words.saving} />
        </form>
      </Sheet>
    </>
  );
}
