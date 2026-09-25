"use client";

import { CURRENCY_CODES } from "@wonderhome/core/i18n/locales";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";

/** The picker's words in the viewer's language, built on the server (story 22-004). */
export type CurrencyFieldLabels = {
  label: string;
  addNew: string;
  placeholder: string;
  chooseExisting: string;
};

/**
 * The one currency picker (story 22-007, rule 20: a choice is picked, not
 * typed). The common ISO codes are offered; "Another currency…" takes any
 * other three-letter code, which the server checks. A record's own currency
 * is always shown and kept — the household default only fills a new one.
 * The codes themselves are never translated.
 */
export function CurrencyField({
  value,
  required = false,
  name = "currency",
  labels,
}: {
  value: string;
  required?: boolean;
  name?: string;
  /** Omitted, the picker speaks English. */
  labels?: CurrencyFieldLabels;
}) {
  const options: string[] = [...CURRENCY_CODES];
  if (value && !options.includes(value)) options.push(value);
  return (
    <ComboboxField
      label={labels?.label ?? "Currency"}
      name={name}
      options={options}
      defaultValue={value}
      required={required}
      addNewLabel={labels?.addNew ?? "Another currency…"}
      chooseExistingLabel={labels?.chooseExisting}
      newValuePlaceholder={labels?.placeholder ?? "Three letters, e.g. JPY"}
    />
  );
}
