"use client";

import { ExternalLink, Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Field } from "@wonderhome/core/ui/field";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { saveChildSchoolAction } from "../(auth)/school-actions";
import { PlaceSearchField, type PlaceSearchLabels, type PlaceSearchValue } from "../_components/place-search-field";
import { SubmitButton } from "../_components/submit-pill";

export type ChildSchoolLabels = {
  field: string;
  gradeField: string;
  gradePlaceholder: string;
  /** `{name}` is the child's name. */
  edit: string;
  title: string;
  lede: string;
  save: string;
  saving: string;
  open: string;
  search: PlaceSearchLabels;
};

const ICON_BUTTON =
  "grid size-9 place-items-center rounded-full text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]";

const named = (template: string, name: string) => template.replaceAll("{name}", name);

/**
 * One child's school row's actions on Kids & School (story 24-010): open the
 * school in Google Maps, and — for an adult — change it right here with the
 * same picker setup uses. Icons with their own labels (rule 11), so the
 * `ActionRow` keeps its room for the child's name and school.
 */
export function ChildSchoolActions({
  householdId,
  child,
  school,
  canChange,
  available,
  labels,
}: {
  householdId: string;
  child: { id: string; name: string };
  school: { name: string; address: string | null; placeId: string | null; mapsUri: string; grade?: string | null } | null;
  canChange: boolean;
  available: boolean;
  labels: ChildSchoolLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, data) => {
    const result = await saveChildSchoolAction(previous, data);
    if (!result.error) setOpen(false);
    return result;
  }, {});
  const initial: PlaceSearchValue | null = school ? { text: school.name, placeId: school.placeId, detail: school.address } : null;

  return (
    <div className="flex items-center gap-1">
      {school ? (
        <a href={school.mapsUri} target="_blank" rel="noopener noreferrer" aria-label={named(labels.open, school.name)} title={named(labels.open, school.name)} className={ICON_BUTTON}>
          <ExternalLink aria-hidden className="size-4" />
        </a>
      ) : null}
      {canChange ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={named(labels.edit, child.name)} title={named(labels.edit, child.name)} className={ICON_BUTTON}>
          <Pencil aria-hidden className="size-4" />
        </button>
      ) : null}
      {canChange ? (
        <Sheet open={open} onOpenChange={setOpen} title={named(labels.title, child.name)} description={labels.lede}>
          <form action={formAction} className="space-y-3">
            {state.error ? <Alert>{state.error}</Alert> : null}
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="childMemberId" value={child.id} />
            <input type="hidden" name="schoolField" value="1" />
            <PlaceSearchField
              householdId={householdId}
              kind="school"
              label={labels.field}
              textName="school_name"
              placeName="school_place_id"
              sessionName="school_session"
              initial={initial}
              available={available}
              labels={labels.search}
            />
            <Field label={labels.gradeField} name="grade" defaultValue={school?.grade ?? ""} placeholder={labels.gradePlaceholder} autoComplete="off" maxLength={40} />
            <SubmitButton className="w-full" pendingLabel={labels.saving}>
              {labels.save}
            </SubmitButton>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}
