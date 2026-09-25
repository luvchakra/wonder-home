"use client";

import { GENDER_OPTIONS, MEMBER_NOTES_MAX_LENGTH } from "@wonderhome/core/identity/member-details";

import { GenderField, type GenderFieldLabels } from "./gender-field";

/** The fields' words in the viewer's language (story 22-004); English when a screen passes none. */
export type MemberDetailLabels = { notes: string; notesPlaceholder: string; gender: GenderFieldLabels };

/**
 * A member's gender and notes — shared by "Add a helper" and the profile
 * editor, so the answer given on the way in is the one that can be changed
 * (or cleared) later (rule 12). Gender is picked, with its own "add another"
 * (rule 20); notes are free text, which is what they are for.
 */
export function MemberDetailFields({ gender, notes, labels }: { gender?: string | null; notes?: string | null; labels?: MemberDetailLabels }) {
  return (
    <>
      <GenderField options={GENDER_OPTIONS} value={gender} labels={labels?.gender} />
      <div className="space-y-1.5">
        <label htmlFor="member-notes" className="block text-sm font-medium">
          {labels?.notes ?? "Notes (optional)"}
        </label>
        <textarea
          id="member-notes"
          name="notes"
          rows={3}
          maxLength={MEMBER_NOTES_MAX_LENGTH}
          defaultValue={notes ?? undefined}
          placeholder={labels?.notesPlaceholder ?? "Languages they speak, how best to reach them, anything worth remembering."}
          className="block w-full resize-y rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
        />
      </div>
    </>
  );
}
