"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  removeActivityAction,
  removeActivityNoteAction,
  removeTeacherAction,
  saveActivityAction,
  saveActivityNoteAction,
  saveTeacherAction,
} from "../(auth)/school-actions";
import { PlaceSearchField, type PlaceSearchLabels } from "../_components/place-search-field";
import { SubmitButton } from "../_components/submit-pill";

/** Every word the child's teachers and classes need, in the reader's language (built on the server). */
export type ChildDetailWords = {
  saving: string;
  teacher: {
    add: string;
    edit: string;
    remove: string;
    sheetAdd: string;
    sheetEdit: string;
    role: string;
    roles: { class_teacher: string; subject_teacher: string };
    subject: string;
    subjects: string[];
    name: string;
    contact: string;
    save: string;
  };
  activity: {
    add: string;
    edit: string;
    remove: string;
    sheetAdd: string;
    sheetEdit: string;
    name: string;
    namePlaceholder: string;
    kind: string;
    kinds: Record<string, string>;
    description: string;
    descriptionPlaceholder: string;
    teacher: string;
    teacherContact: string;
    place: string;
    days: string;
    /** Monday first, as ISO weekdays 1…7. */
    dayNames: string[];
    startsAt: string;
    endsAt: string;
    startsOn: string;
    endsOn: string;
    notes: string;
    calendarHint: string;
    save: string;
  };
  note: {
    add: string;
    sheetTitle: string;
    kind: string;
    kinds: { competition: string; award: string; note: string };
    title: string;
    titlePlaceholder: string;
    onDate: string;
    result: string;
    resultPlaceholder: string;
    detail: string;
    save: string;
    remove: string;
  };
  addNew: string;
  chooseExisting: string;
  placeSearch: PlaceSearchLabels;
  placeAvailable: boolean;
};

export type TeacherValue = { id: string; role: "class_teacher" | "subject_teacher"; subject: string | null; name: string; contact: string | null };
export type ActivityValue = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  teacherName: string | null;
  teacherContact: string | null;
  place: { name: string | null; placeId: string | null; address: string | null } | null;
  days: number[];
  startsAt: string | null;
  endsAt: string | null;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
};

const ICON_BUTTON =
  "grid size-9 place-items-center rounded-full text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50";
const ADD_LINK =
  "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--wh-radius-pill)] px-2 text-sm font-semibold text-[var(--wh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]";
const TEXTAREA = "block w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-base";

const named = (template: string, name: string) => template.replaceAll("{name}", name);

/** A form in a sheet that closes once its save goes through. */
function useSheetForm(action: (previous: ActionState, data: FormData) => Promise<ActionState>) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, data) => {
    const result = await action(previous, data);
    if (!result.error) setOpen(false);
    return result;
  }, {});
  return { open, setOpen, state, formAction };
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

/** Stand something down (kept, not deleted), as an icon with its own label. */
export function StandDownButton({ kind, householdId, id, label }: { kind: "teacher" | "activity" | "note"; householdId: string; id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = kind === "teacher" ? removeTeacherAction : kind === "activity" ? removeActivityAction : removeActivityNoteAction;
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
            const result = await act({ householdId, id });
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

/** Add a class teacher or subject teacher, or change one (08-010). */
export function TeacherSheet({ householdId, child, teacher, words }: { householdId: string; child: { id: string; name: string }; teacher?: TeacherValue; words: ChildDetailWords }) {
  const { open, setOpen, state, formAction } = useSheetForm(saveTeacherAction);
  const [role, setRole] = useState<TeacherValue["role"]>(teacher?.role ?? "class_teacher");
  const w = words.teacher;
  return (
    <>
      <Trigger editing={Boolean(teacher)} label={teacher ? named(w.edit, teacher.name) : w.add} onClick={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen} title={teacher ? named(w.sheetEdit, teacher.name) : named(w.sheetAdd, child.name)}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="childMemberId" value={child.id} />
          <input type="hidden" name="id" value={teacher?.id ?? ""} />
          <Select label={w.role} name="role" value={role} onChange={(event) => setRole(event.target.value as TeacherValue["role"])}>
            <option value="class_teacher">{w.roles.class_teacher}</option>
            <option value="subject_teacher">{w.roles.subject_teacher}</option>
          </Select>
          {role === "subject_teacher" ? (
            <ComboboxField
              label={w.subject}
              name="subject"
              required
              options={w.subjects}
              defaultValue={teacher?.subject ?? undefined}
              addNewLabel={words.addNew}
              chooseExistingLabel={words.chooseExisting}
            />
          ) : null}
          <Field label={w.name} name="name" required defaultValue={teacher?.name ?? ""} autoComplete="off" maxLength={120} />
          <Field label={w.contact} name="contact" defaultValue={teacher?.contact ?? ""} autoComplete="off" maxLength={160} />
          <SubmitButton className="w-full" pendingLabel={words.saving}>
            {w.save}
          </SubmitButton>
        </form>
      </Sheet>
    </>
  );
}

/** Add a class outside school, or change one (08-011): what it is, who teaches it, where, and when. */
export function ActivitySheet({ householdId, child, activity, words }: { householdId: string; child: { id: string; name: string }; activity?: ActivityValue; words: ChildDetailWords }) {
  const { open, setOpen, state, formAction } = useSheetForm(saveActivityAction);
  const w = words.activity;
  const kinds = Object.keys(w.kinds);
  return (
    <>
      <Trigger editing={Boolean(activity)} label={activity ? named(w.edit, activity.name) : w.add} onClick={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen} title={activity ? named(w.sheetEdit, activity.name) : named(w.sheetAdd, child.name)} description={w.calendarHint}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="childMemberId" value={child.id} />
          <input type="hidden" name="id" value={activity?.id ?? ""} />
          <input type="hidden" name="place_current" value={activity?.place?.placeId ?? ""} />
          <Field label={w.name} name="name" required defaultValue={activity?.name ?? ""} placeholder={w.namePlaceholder} autoComplete="off" maxLength={120} />
          <ComboboxField
            label={w.kind}
            name="kind"
            required
            options={kinds}
            optionLabels={w.kinds}
            defaultValue={activity?.kind ?? "music"}
            addNewLabel={words.addNew}
            chooseExistingLabel={words.chooseExisting}
          />
          <Field label={w.description} name="description" defaultValue={activity?.description ?? ""} placeholder={w.descriptionPlaceholder} autoComplete="off" maxLength={300} />
          <fieldset className="space-y-2">
            <legend className="mb-1.5 block text-sm font-medium">{w.days}</legend>
            <div className="flex flex-wrap gap-2">
              {w.dayNames.map((day, index) => (
                <label key={day} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] px-3 text-sm has-[:checked]:border-[var(--wh-primary)] has-[:checked]:bg-[var(--wh-primary-soft)]">
                  <input type="checkbox" name="days" value={index + 1} defaultChecked={activity?.days.includes(index + 1)} className="accent-[var(--wh-primary)]" />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label={w.startsAt} name="startsAt" type="time" defaultValue={activity?.startsAt ?? ""} />
            <Field label={w.endsAt} name="endsAt" type="time" defaultValue={activity?.endsAt ?? ""} />
          </div>
          <Field label={w.teacher} name="teacherName" defaultValue={activity?.teacherName ?? ""} autoComplete="off" maxLength={120} />
          <Field label={w.teacherContact} name="teacherContact" defaultValue={activity?.teacherContact ?? ""} autoComplete="off" maxLength={160} />
          <PlaceSearchField
            householdId={householdId}
            kind="place"
            label={w.place}
            textName="place_name"
            placeName="place_id"
            sessionName="place_session"
            initial={activity?.place ? { text: activity.place.name ?? activity.place.address ?? "", placeId: activity.place.placeId, detail: activity.place.address } : null}
            available={words.placeAvailable}
            labels={words.placeSearch}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label={w.startsOn} name="startsOn" type="date" defaultValue={activity?.startsOn ?? ""} />
            <Field label={w.endsOn} name="endsOn" type="date" defaultValue={activity?.endsOn ?? ""} />
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{w.notes}</span>
            <textarea name="notes" rows={3} maxLength={2000} defaultValue={activity?.notes ?? ""} className={TEXTAREA} />
          </label>
          <SubmitButton className="w-full" pendingLabel={words.saving}>
            {w.save}
          </SubmitButton>
        </form>
      </Sheet>
    </>
  );
}

/** A competition coming up, a medal or award won, or a note, on one class. */
export function ActivityNoteSheet({ householdId, activity, words }: { householdId: string; activity: { id: string; name: string }; words: ChildDetailWords }) {
  const { open, setOpen, state, formAction } = useSheetForm(saveActivityNoteAction);
  const [kind, setKind] = useState<"competition" | "award" | "note">("competition");
  const w = words.note;
  return (
    <>
      <Trigger editing={false} label={w.add} onClick={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen} title={named(w.sheetTitle, activity.name)}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="activityId" value={activity.id} />
          <Select label={w.kind} name="kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="competition">{w.kinds.competition}</option>
            <option value="award">{w.kinds.award}</option>
            <option value="note">{w.kinds.note}</option>
          </Select>
          <Field label={w.title} name="title" required placeholder={w.titlePlaceholder} autoComplete="off" maxLength={200} />
          <Field label={w.onDate} name="onDate" type="date" />
          {kind === "award" ? <Field label={w.result} name="result" placeholder={w.resultPlaceholder} autoComplete="off" maxLength={120} /> : null}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{w.detail}</span>
            <textarea name="detail" rows={2} maxLength={1000} className={TEXTAREA} />
          </label>
          <SubmitButton className="w-full" pendingLabel={words.saving}>
            {w.save}
          </SubmitButton>
        </form>
      </Sheet>
    </>
  );
}
