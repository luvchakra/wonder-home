"use client";

import { GENDER_OPTIONS, MEMBER_NOTES_MAX_LENGTH } from "@wonderhome/core/identity/member-details";

import { GenderField } from "./gender-field";

/**
 * A member's gender and notes — shared by "Add a helper" and the profile
 * editor, so the answer given on the way in is the one that can be changed
 * (or cleared) later (rule 12). Gender is picked, with its own "add another"
 * (rule 20); notes are free text, which is what they are for.
 */
export function MemberDetailFields({ gender, notes }: { gender?: string | null; notes?: string | null }) {
  return (
    <>
      <GenderField options={GENDER_OPTIONS} value={gender} />
      <div className="space-y-1.5">
        <label htmlFor="member-notes" className="block text-sm font-medium">
          Notes (optional)
        </label>
        <textarea
          id="member-notes"
          name="notes"
          rows={3}
          maxLength={MEMBER_NOTES_MAX_LENGTH}
          defaultValue={notes ?? undefined}
          placeholder="Languages they speak, how best to reach them, anything worth remembering."
          className="block w-full resize-y rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
        />
      </div>
    </>
  );
}
