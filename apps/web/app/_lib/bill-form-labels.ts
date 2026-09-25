import type { Translate } from "@wonderhome/core/i18n/translate";

import type { BillFormLabels } from "../_components/finance-forms";
import { BILL_KINDS } from "./bill-kinds";

/** Placeholders the sheets fill in on the client with a bill's own name, its period or its kind. */
const KEEP = { name: "{name}", period: "{period}", kind: "{kind}" };

type BillKind = (typeof BILL_KINDS)[number]["value"];

/** A bill's kind in the viewer's words (story 22-004); an unknown stored kind is shown as it is. */
export function billKindName(t: Translate, kind: string): string {
  return BILL_KINDS.some((k) => k.value === kind) ? t(`bills.kind.${kind as BillKind}`) : kind.replace(/_/g, " ");
}

/** Every bill, transaction and budget sheet's words in the viewer's language (story 22-004). */
export function billFormLabels(t: Translate): BillFormLabels {
  return {
    kinds: Object.fromEntries(BILL_KINDS.map((k) => [k.value, t(`bills.kind.${k.value}`)])),
    kindsInSentence: Object.fromEntries(BILL_KINDS.map((k) => [k.value, t(`billForm.kindInSentence.${k.value}`)])),
    recurrence: {
      monthly: t("billForm.recurrence.monthly"),
      quarterly: t("billForm.recurrence.quarterly"),
      yearly: t("billForm.recurrence.yearly"),
      one_off: t("billForm.recurrence.one_off"),
    },
    budgetPeriods: {
      month: t("billForm.budget.period.month"),
      quarter: t("billForm.budget.period.quarter"),
      year: t("billForm.budget.period.year"),
    },
    add: t("billForm.add"),
    addDescription: t("billForm.addDescription"),
    addSubmit: t("billForm.addSubmit"),
    adding: t("common.adding"),
    name: t("billForm.name"),
    namePlaceholder: t("billForm.namePlaceholder"),
    kind: t("billForm.kind"),
    recurs: t("billForm.recurs"),
    payee: t("billForm.payee"),
    payeePlaceholder: t("billForm.payeePlaceholder"),
    amountOptional: t("billForm.amountOptional"),
    dueOptional: t("billForm.dueOptional"),
    edit: t("billForm.edit", KEEP),
    editDescription: t("billForm.editDescription"),
    saveChanges: t("billForm.saveChanges"),
    saving: t("common.saving"),
    cancel: t("billForm.cancel", KEEP),
    payeeChoose: t("billForm.payeeChoose"),
    notRecorded: t("billForm.notRecorded"),
    addPayee: t("billForm.addPayee"),
    kindOptional: t("billForm.kindOptional"),
    kindChoose: t("billForm.kindChoose"),
    addKind: t("billForm.addKind"),
    kindNewPlaceholder: t("billForm.kindNewPlaceholder"),
    owner: t("billForm.owner"),
    noOne: t("billForm.noOne"),
    chooseExisting: t("common.chooseExisting"),
    addTransaction: t("billForm.addTransaction"),
    addTransactionDescription: t("billForm.addTransactionDescription"),
    whichBill: t("billForm.whichBill"),
    period: t("billForm.period"),
    periodHint: t("billForm.periodHint"),
    amount: t("billForm.amount"),
    paidOn: t("billForm.paidOn"),
    paidOnHint: t("billForm.paidOnHint"),
    record: t("billForm.record"),
    recording: t("billForm.recording"),
    editButton: t("billForm.editButton"),
    editTransaction: t("billForm.editTransaction"),
    transactionFor: t("billForm.transactionFor", KEEP),
    remove: t("billForm.remove"),
    removeNamed: t("billForm.removeNamed", KEEP),
    removeTransaction: t("billForm.removeTransaction"),
    removeTransactionDescription: t("billForm.removeTransactionDescription", KEEP),
    budgetSet: t("billForm.budget.set"),
    budgetSetDescription: t("billForm.budget.setDescription"),
    budgetSave: t("billForm.budget.save"),
    budgetFor: t("billForm.budget.for"),
    budgetHowOften: t("billForm.budget.howOften"),
    budgetUpTo: t("billForm.budget.upTo"),
    budgetCurrencyNote: t("billForm.budget.currencyNote"),
    budgetName: t("billForm.budget.name", KEEP),
    budgetEditDescription: t("billForm.budget.editDescription"),
    budgetRemoveTitle: t("billForm.budget.removeTitle", KEEP),
    budgetRemoveDescription: t("billForm.budget.removeDescription"),
    currency: {
      label: t("billForm.currency"),
      addNew: t("billForm.currencyOther"),
      placeholder: t("billForm.currencyPlaceholder"),
      chooseExisting: t("common.chooseExisting"),
    },
  };
}
