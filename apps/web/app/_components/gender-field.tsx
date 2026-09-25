"use client";

import { ComboboxField } from "@wonderhome/core/ui/combobox-field";

/** The picker's own words in the viewer's language (story 22-004); English when a screen passes none. */
export type GenderFieldLabels = {
  label: string;
  empty: string;
  addNew: string;
  newPlaceholder: string;
  chooseExisting: string;
};

const ENGLISH: GenderFieldLabels = {
  label: "Gender (optional)",
  empty: "Not recorded",
  addNew: "Describe another way…",
  newPlaceholder: "In their own words",
  chooseExisting: "Choose existing",
};

/**
 * The one gender picker, for people and pets alike: picked from a short list
 * with its own "add another" (rule 20), optional, and always able to show an
 * answer given earlier even when it isn't one of today's options — so what
 * was said on the way in is what can be changed or cleared later (rule 12).
 */
export function GenderField({ options, value, labels = ENGLISH }: { options: readonly string[]; value?: string | null; labels?: GenderFieldLabels }) {
  const choices: string[] = [...options];
  if (value && !choices.includes(value)) choices.push(value);

  return (
    <ComboboxField
      label={labels.label}
      name="gender"
      options={choices}
      defaultValue={value ?? undefined}
      emptyLabel={labels.empty}
      addNewLabel={labels.addNew}
      chooseExistingLabel={labels.chooseExisting}
      newValuePlaceholder={labels.newPlaceholder}
    />
  );
}
