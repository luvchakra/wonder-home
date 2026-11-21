import { currencyExponent } from "@wonderhome/core/billing/money";

import { PAID_WITH, type PaidWith } from "@wonderhome/core/finance/part-payment";
import type { Translate } from "@wonderhome/core/i18n/translate";

import type { MarkPaidLabels } from "../_components/mark-bill-paid-button";

/** What a bill row needs to offer "Mark paid": the words, the household's today and its currency. */
export function markPaidProps(t: Translate, input: { householdId: string; timezone: string; currency: string; now?: Date }) {
  const key = (name: Exclude<keyof MarkPaidLabels, "methods">) => t(`bills.markPaid.${name}` as const);
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
      paidBy: key("paidBy"),
      paidBySomeone: key("paidBySomeone"),
      howMuch: key("howMuch"),
      full: key("full"),
      part: key("part"),
      paidWith: key("paidWith"),
      paidWithNotSaid: key("paidWithNotSaid"),
      partDone: key("partDone"),
      methods: paidWithWords(t),
    } satisfies MarkPaidLabels,
  };
}

/** "UPI", "Card", "Cash", "Bank transfer", in the reader's language (11-019). */
export function paidWithWords(t: Translate): Record<PaidWith, string> {
  return Object.fromEntries(PAID_WITH.map((method) => [method, t(`bills.paidWith.${method}` as const)])) as Record<PaidWith, string>;
}
