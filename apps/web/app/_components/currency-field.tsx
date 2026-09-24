"use client";

import { CURRENCY_CODES } from "@wonderhome/core/i18n/locales";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";

/**
 * The one currency picker (story 22-007, rule 20: a choice is picked, not
 * typed). The common ISO codes are offered; "Another currency…" takes any
 * other three-letter code, which the server checks. A record's own currency
 * is always shown and kept — the household default only fills a new one.
 */
export function CurrencyField({ value, required = false, name = "currency" }: { value: string; required?: boolean; name?: string }) {
  const options: string[] = [...CURRENCY_CODES];
  if (value && !options.includes(value)) options.push(value);
  return (
    <ComboboxField
      label="Currency"
      name={name}
      options={options}
      defaultValue={value}
      required={required}
      addNewLabel="Another currency…"
      newValuePlaceholder="Three letters, e.g. JPY"
    />
  );
}
