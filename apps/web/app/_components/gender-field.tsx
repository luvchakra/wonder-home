"use client";

import { ComboboxField } from "@wonderhome/core/ui/combobox-field";

/**
 * The one gender picker, for people and pets alike: picked from a short list
 * with its own "add another" (rule 20), optional, and always able to show an
 * answer given earlier even when it isn't one of today's options — so what
 * was said on the way in is what can be changed or cleared later (rule 12).
 */
export function GenderField({ options, value }: { options: readonly string[]; value?: string | null }) {
  const choices: string[] = [...options];
  if (value && !choices.includes(value)) choices.push(value);

  return (
    <ComboboxField
      label="Gender (optional)"
      name="gender"
      options={choices}
      defaultValue={value ?? undefined}
      emptyLabel="Not recorded"
      addNewLabel="Describe another way…"
      newValuePlaceholder="In their own words"
    />
  );
}
