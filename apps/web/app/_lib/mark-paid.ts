import { currencyExponent } from "@wonderhome/core/billing/money";

import type { Translate } from "@wonderhome/core/i18n/translate";

import type { MarkPaidLabels } from "../_components/mark-bill-paid-button";

/** What a bill row needs to offer "Mark paid": the words, the household's today and its currency. */
export function markPaidProps(t: Translate, input: { householdId: string; timezone: string; currency: string; now?: Date }) {
  const key = (name: keyof MarkPaidLabels) => t(`bills.markPaid.${name}` as const);
  return {
    householdId: input.householdId,
    today: new Intl.DateTimeFormat("en-CA", { timeZone: input.timezone }).format(input.now ?? new Date()),
    currency: input.currency,
    exponent: currencyExponent(input.currency),
    labels: {
      button: key("button"),
      title: key("title"),
      description: key("description"),
      amount: key("amount"),
      paidOn: key("paidOn"),
      confirm: key("confirm"),
      saving: key("saving"),
      done: key("done"),
      undo: key("undo"),
      undone: key("undone"),
      failed: key("failed"),
    } satisfies MarkPaidLabels,
  };
}
