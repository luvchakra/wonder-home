"use client";

import { Ban, Pencil, Plus, Trash2 } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  cancelObligationAction,
  createObligationAction,
  fillBillPeriodAction,
  recordAmountAction,
  removeTransactionAction,
  retireBudgetAction,
  saveBudgetAction,
  updateObligationAction,
} from "../(auth)/finance-actions";
import { BILL_KINDS } from "../_lib/bill-kinds";
import { CurrencyField, type CurrencyFieldLabels } from "./currency-field";

const KINDS = BILL_KINDS;

/**
 * Every bill, transaction and budget sheet's words in the viewer's language,
 * built on the server by `billFormLabels` (story 22-004). `{name}`,
 * `{period}` and `{kind}` stay placeholders and are filled in here with the
 * household's own bill names and periods, which are never translated.
 */
export type BillFormLabels = {
  /** A bill kind's words by its stored value (`utility`, `school_fee`…). */
  kinds: Record<string, string>;
  /** The same, as it reads inside a sentence ("Remove the utility budget?"). */
  kindsInSentence: Record<string, string>;
  recurrence: { monthly: string; quarterly: string; yearly: string; one_off: string };
  budgetPeriods: Record<BudgetInitial["period"], string>;
  add: string;
  addDescription: string;
  addSubmit: string;
  adding: string;
  name: string;
  namePlaceholder: string;
  kind: string;
  recurs: string;
  payee: string;
  payeePlaceholder: string;
  amountOptional: string;
  dueOptional: string;
  edit: string;
  editDescription: string;
  saveChanges: string;
  saving: string;
  cancel: string;
  payeeChoose: string;
  notRecorded: string;
  addPayee: string;
  kindOptional: string;
  kindChoose: string;
  addKind: string;
  kindNewPlaceholder: string;
  owner: string;
  noOne: string;
  chooseExisting: string;
  addTransaction: string;
  addTransactionDescription: string;
  whichBill: string;
  period: string;
  periodHint: string;
  amount: string;
  paidOn: string;
  paidOnHint: string;
  record: string;
  recording: string;
  editButton: string;
  editTransaction: string;
  transactionFor: string;
  remove: string;
  removeNamed: string;
  removeTransaction: string;
  removeTransactionDescription: string;
  budgetSet: string;
  budgetSetDescription: string;
  budgetSave: string;
  budgetFor: string;
  budgetHowOften: string;
  budgetUpTo: string;
  budgetCurrencyNote: string;
  /** A budget's name ("Utility budget"), only ever read inside `edit`/`removeNamed`. */
  budgetName: string;
  budgetEditDescription: string;
  budgetRemoveTitle: string;
  budgetRemoveDescription: string;
  currency: CurrencyFieldLabels;
  /** Picking the bill (11-010). `types` are the typical bills by key (`bill-catalog.ts`). */
  whatIsIt: string;
  somethingElse: string;
  types: Record<string, string>;
  whoPays: string;
  /** `{place}` is the home's city or state. */
  payeesNear: string;
  payeesAnywhere: string;
  earlierTitle: string;
  earlierHint: string;
  earlierMonth: string;
  earlierAmount: string;
  earlierPaidOn: string;
  earlierAdd: string;
  earlierRemove: string;
};

/** What the bill form offers, worked out on the server from the home's location and the household's own bills. */
export type BillChoices = {
  /** Payees for each payee list (`payees.ts` category), nearest first. */
  payees: Record<string, { near: string[]; others: string[] }>;
  /** Payees already on this household's bills and transactions. */
  householdPayees: string[];
  members: { id: string; displayName: string }[];
  /** The home's city or state, for the payee hint; null when no address is saved. */
  place: string | null;
  /** Each typical bill's kind, how often it comes and its payee list, by key. */
  types: { key: string; kind: string; recurrence: string; payees: string }[];
};

/** Fills `{name}`-style placeholders with the household's own words, which are never translated. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export type ObligationInitial = {
  id: string;
  name: string;
  kind: string;
  payee: string | null;
  amountMinor: number | null;
  currency: string | null;
  dueOn: string | null;
  billType?: string | null;
  recurrence?: string | null;
  responsibleMemberId?: string | null;
};

function currentPeriodLabel(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const SELECT_CLASS =
  "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";

/**
 * The fields "add" and "edit" share — only the action, the heading and the
 * submit label differ. A bill starts from what it is (rule 20): picking
 * "Electricity" fills in its kind and that it comes monthly, and offers the
 * electricity companies for where the family lives first. "Something else"
 * keeps every field the household's own.
 */
function ObligationFields({
  householdId,
  initial,
  state,
  defaultCurrency = "INR",
  labels,
  choices,
}: {
  householdId: string;
  initial?: ObligationInitial;
  state: ActionState;
  /** The household's currency, for a new bill (story 22-007). A bill already on record keeps its own. */
  defaultCurrency?: string;
  labels: BillFormLabels;
  choices: BillChoices;
}) {
  const [typeKey, setTypeKey] = useState(initial ? (initial.billType ?? "") : "electricity");
  const type = choices.types.find((entry) => entry.key === typeKey) ?? null;
  const [name, setName] = useState(initial?.name ?? (type ? (labels.types[type.key] ?? "") : ""));
  const [nameTouched, setNameTouched] = useState(Boolean(initial));
  const [recurrence, setRecurrence] = useState(initial?.recurrence ?? type?.recurrence ?? "monthly");
  const [earlier, setEarlier] = useState(0);
  const listed = type ? (choices.payees[type.payees] ?? { near: [], others: [] }) : { near: [], others: [] };
  // Nearest first, then the rest of this kind's list; the household's own
  // payees lead only where the kind has no list of its own (a landlord, a
  // school), and otherwise follow, so a loan never opens on the power company.
  const ownList = listed.near.length + listed.others.length === 0;
  const payeeOptions = [...new Set(ownList ? choices.householdPayees : [...listed.near, ...listed.others, ...choices.householdPayees])];
  const currentPayee = initial?.payee ?? undefined;
  const byKind = KINDS.map((kind) => ({ kind, types: choices.types.filter((entry) => entry.kind === kind.value) })).filter((group) => group.types.length > 0);

  return (
    <>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="billType" value={typeKey} />
      <div className="space-y-1.5">
        <label htmlFor="billTypeChoice" className="block text-sm font-medium">
          {labels.whatIsIt}
        </label>
        <select
          id="billTypeChoice"
          value={typeKey}
          onChange={(event) => {
            const next = choices.types.find((entry) => entry.key === event.target.value) ?? null;
            setTypeKey(event.target.value);
            if (next) setRecurrence(next.recurrence);
            if (!nameTouched) setName(next ? (labels.types[next.key] ?? "") : "");
          }}
          className={SELECT_CLASS}
        >
          {byKind.map((group) => (
            <optgroup key={group.kind.value} label={labels.kinds[group.kind.value] ?? group.kind.label}>
              {group.types.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {labels.types[entry.key] ?? entry.key}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="">{labels.somethingElse}</option>
        </select>
      </div>
      <Field
        label={labels.name}
        name="name"
        required
        placeholder={labels.namePlaceholder}
        autoComplete="off"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setNameTouched(true);
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        {type ? (
          <input type="hidden" name="kind" value={type.kind} />
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="kind" className="block text-sm font-medium">
              {labels.kind}
            </label>
            <select id="kind" name="kind" defaultValue={initial?.kind ?? "utility"} className={SELECT_CLASS}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {labels.kinds[k.value] ?? k.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={type ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
          <label htmlFor="recurrence" className="block text-sm font-medium">
            {labels.recurs}
          </label>
          <select id="recurrence" name="recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value)} className={SELECT_CLASS}>
            <option value="monthly">{labels.recurrence.monthly}</option>
            <option value="quarterly">{labels.recurrence.quarterly}</option>
            <option value="yearly">{labels.recurrence.yearly}</option>
            <option value="one_off">{labels.recurrence.one_off}</option>
          </select>
        </div>
      </div>
      {/* A new list of payees for each kind of bill, so the box starts again when the bill changes. */}
      <ComboboxField
        key={`payee-${typeKey}`}
        label={labels.payee}
        name="payee"
        options={currentPayee && !payeeOptions.includes(currentPayee) ? [...payeeOptions, currentPayee] : payeeOptions}
        defaultValue={currentPayee}
        placeholder={labels.payeeChoose}
        emptyLabel={labels.notRecorded}
        addNewLabel={labels.addPayee}
        chooseExistingLabel={labels.chooseExisting}
        newValuePlaceholder={labels.payeePlaceholder}
        hint={listed.near.length > 0 && choices.place ? fill(labels.payeesNear, { place: choices.place }) : listed.others.length > 0 ? labels.payeesAnywhere : undefined}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={labels.amountOptional}
          name="amount"
          type="number"
          min={0}
          step="0.01"
          placeholder="2500"
          defaultValue={
            initial?.amountMinor != null ? initial.amountMinor / 100 : undefined
          }
        />
        <CurrencyField value={initial?.currency ?? defaultCurrency} labels={labels.currency} />
      </div>
      {/* Full width on a phone: "No one in particular" and the date are never cut (rule 15). */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={labels.dueOptional}
          name="dueOn"
          type="date"
          defaultValue={initial?.dueOn ?? undefined}
        />
        <Select label={labels.whoPays} name="responsibleMemberId" defaultValue={initial?.responsibleMemberId ?? ""}>
          <option value="">{labels.noOne}</option>
          {choices.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </Select>
      </div>
      {initial ? null : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{labels.earlierTitle}</legend>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.earlierHint}</p>
          {Array.from({ length: earlier }, (_, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-2 sm:grid-cols-3">
              {/* The month reads whole ("September 2026"), so it has the row to itself on a phone. */}
              <div className="col-span-2 sm:col-span-1">
                <Field label={labels.earlierMonth} name={`earlier.${index}.month`} type="month" required />
              </div>
              <Field label={labels.earlierAmount} name={`earlier.${index}.amount`} type="number" min={0} step="0.01" inputMode="decimal" required />
              <Field label={labels.earlierPaidOn} name={`earlier.${index}.paidOn`} type="date" />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Pill type="button" tone="quiet" className="gap-1.5" onClick={() => setEarlier((count) => Math.min(24, count + 1))}>
              <Plus aria-hidden className="size-3.5" /> {labels.earlierAdd}
            </Pill>
            {earlier > 0 ? (
              <Pill type="button" tone="quiet" onClick={() => setEarlier((count) => Math.max(0, count - 1))}>
                {labels.earlierRemove}
              </Pill>
            ) : null}
          </div>
        </fieldset>
      )}
    </>
  );
}

function Submit({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** "Add a bill" as a sheet — there was no way onto this page's data without a live connector or the AI chat link. */
export function AddBillButton({
  householdId,
  defaultCurrency,
  labels,
  choices,
}: {
  householdId: string;
  defaultCurrency?: string;
  labels: BillFormLabels;
  choices: BillChoices;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    createObligationAction,
    {},
  );

  return (
    <>
      <Pill
        type="button"
        tone="soft"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus aria-hidden className="size-3.5" /> {labels.add}
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={labels.add}
        description={labels.addDescription}
      >
        <form action={formAction} className="space-y-3">
          <ObligationFields householdId={householdId} state={state} defaultCurrency={defaultCurrency} labels={labels} choices={choices} />
          <Submit label={labels.addSubmit} pendingLabel={labels.adding} />
        </form>
      </Sheet>
    </>
  );
}

/** Editing or standing down a bill already on the list — the update and cancel half of "Add a bill". */
export function ObligationRowControls({
  householdId,
  bill,
  labels,
  choices,
}: {
  householdId: string;
  bill: ObligationInitial;
  labels: BillFormLabels;
  choices: BillChoices;
}) {
  const [open, setOpen] = useState(false);
  const [editState, editAction] = useActionState<ActionState, FormData>(
    updateObligationAction,
    {},
  );
  const [cancelState, cancelAction] = useActionState<ActionState, FormData>(
    cancelObligationAction,
    {},
  );
  const editLabel = fill(labels.edit, { name: bill.name });

  return (
    <div className="flex items-center gap-1.5">
      <Pill
        type="button"
        tone="quiet"
        onClick={() => setOpen(true)}
        aria-label={editLabel}
        title={editLabel}
      >
        <Pencil aria-hidden className="size-3.5" />
      </Pill>
      <form action={cancelAction}>
        <input type="hidden" name="id" value={bill.id} />
        <input type="hidden" name="householdId" value={householdId} />
        <CancelSubmit label={fill(labels.cancel, { name: bill.name })} />
      </form>
      {cancelState.error ? (
        <p className="text-xs text-[var(--wh-risk)]">{cancelState.error}</p>
      ) : null}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={editLabel}
        description={labels.editDescription}
      >
        <form action={editAction} className="space-y-3">
          <ObligationFields
            householdId={householdId}
            initial={bill}
            state={editState}
            labels={labels}
            choices={choices}
          />
          <Submit label={labels.saveChanges} pendingLabel={labels.saving} />
        </form>
      </Sheet>
    </div>
  );
}

function CancelSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Pill
      type="submit"
      tone="quiet"
      disabled={pending}
      aria-label={label}
      title={label}
    >
      {pending ? "…" : <Ban aria-hidden className="size-3.5" />}
    </Pill>
  );
}

export type TransactionBill = {
  id: string;
  name: string;
  currency: string | null;
  kind: string;
  payee: string | null;
  responsibleMemberId: string | null;
};

export type TransactionInitial = {
  obligationId: string;
  periodLabel: string;
  amountMinor: number;
  currency: string;
  paidOn?: string | null;
  payee?: string | null;
  kind?: string | null;
  ownerMemberId?: string | null;
};

type TransactionChoices = {
  members: { id: string; displayName: string }[];
  /** Payees already on this household's bills and transactions. */
  payeeOptions: string[];
  /** Kinds this household has written in on a transaction, beyond the bill kinds. */
  kindOptions: string[];
};

/**
 * The words a bill's own kind is written in on a transaction, so a
 * transaction defaults to the same ones. A transaction's kind is free text
 * the household keeps (rule 20), so these stay the stored English words in
 * every language — like a grocery category, the list shows exactly what is
 * saved, and translating it would change what gets written.
 */
function kindLabel(kind: string): string {
  return KINDS.find((k) => k.value === kind)?.label ?? kind.replace(/_/g, " ");
}

/**
 * A transaction's payee, kind and owner. It starts with its bill's own three
 * — the common case needs no typing — and can say otherwise; payee and kind
 * offer every answer this household has used and always "add new" (rule 20).
 */
function TransactionDetailFields({
  bill,
  initial,
  members,
  payeeOptions,
  kindOptions,
  labels,
}: TransactionChoices & {
  bill: TransactionBill | undefined;
  initial?: TransactionInitial;
  labels: BillFormLabels;
}) {
  const payee = initial ? (initial.payee ?? bill?.payee ?? undefined) : (bill?.payee ?? undefined);
  const kind = initial?.kind ?? (bill ? kindLabel(bill.kind) : undefined);
  const owner = initial ? (initial.ownerMemberId ?? bill?.responsibleMemberId ?? "") : (bill?.responsibleMemberId ?? "");
  const withCurrent = (options: string[], value: string | undefined) =>
    value && !options.includes(value) ? [...options, value] : options;
  // Every bill kind, then any kind this household has already written in.
  const kinds = Array.from(new Set([...KINDS.map((k) => k.label), ...kindOptions]));

  return (
    <>
      <ComboboxField
        label={labels.payee}
        name="payee"
        options={withCurrent(payeeOptions, payee)}
        defaultValue={payee}
        placeholder={labels.payeeChoose}
        emptyLabel={labels.notRecorded}
        addNewLabel={labels.addPayee}
        chooseExistingLabel={labels.chooseExisting}
        newValuePlaceholder={labels.payeePlaceholder}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <ComboboxField
          label={labels.kindOptional}
          name="kind"
          options={withCurrent(kinds, kind)}
          defaultValue={kind}
          placeholder={labels.kindChoose}
          emptyLabel={labels.notRecorded}
          addNewLabel={labels.addKind}
          chooseExistingLabel={labels.chooseExisting}
          newValuePlaceholder={labels.kindNewPlaceholder}
        />
        <Select label={labels.owner} name="ownerMemberId" defaultValue={owner}>
          <option value="">{labels.noOne}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}

/**
 * "Add transaction" as a sheet — the manual half of an imported bill's own
 * amount, recording what a bill actually came to for a period via the same
 * `recordAmount` the email connector already uses.
 */
export function AddTransactionButton({
  householdId,
  bills,
  defaultCurrency = "INR",
  labels,
  ...choices
}: TransactionChoices & {
  householdId: string;
  bills: TransactionBill[];
  /** For a bill with no currency of its own yet (story 22-007). */
  defaultCurrency?: string;
  labels: BillFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    recordAmountAction,
    {},
  );
  const [billId, setBillId] = useState(bills[0]?.id);
  const bill = bills.find((b) => b.id === billId) ?? bills[0];

  if (bills.length === 0) return null;

  return (
    <>
      <Pill
        type="button"
        tone="soft"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus aria-hidden className="size-3.5" /> {labels.addTransaction}
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={labels.addTransaction}
        description={labels.addTransactionDescription}
      >
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Select
            label={labels.whichBill}
            name="obligationId"
            value={bill?.id}
            onChange={(event) => setBillId(event.target.value)}
          >
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Field
            label={labels.period}
            name="periodLabel"
            required
            placeholder="2026-09"
            defaultValue={currentPeriodLabel()}
            autoComplete="off"
            hint={labels.periodHint}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={labels.amount}
              name="amount"
              type="number"
              min={0}
              step="0.01"
              required
              placeholder="2500"
            />
            <CurrencyField key={`currency-${bill?.id}`} value={bill?.currency ?? defaultCurrency} required labels={labels.currency} />
          </div>
          {/* Keyed by bill, so choosing another bill brings in that bill's own payee, kind and owner. */}
          <TransactionDetailFields key={bill?.id} bill={bill} labels={labels} {...choices} />
          <Field
            label={labels.paidOn}
            name="paidOn"
            type="date"
            hint={labels.paidOnHint}
          />
          <Submit label={labels.record} pendingLabel={labels.recording} />
        </form>
      </Sheet>
    </>
  );
}

/**
 * Changing a recorded transaction — the "update" half of "Add transaction"
 * (CLAUDE.md principle 12). The bill and period are what identify it, so
 * they stay as they are; everything else can change. Saved through the same
 * `recordAmount` upsert, so an edited amount gets the same anomaly review.
 */
export function EditTransactionControl({
  householdId,
  bill,
  transaction,
  labels,
  ...choices
}: TransactionChoices & {
  householdId: string;
  bill: TransactionBill;
  transaction: TransactionInitial;
  labels: BillFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    recordAmountAction,
    {},
  );

  return (
    <>
      <Pill
        type="button"
        tone="quiet"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Pencil aria-hidden className="size-3.5" /> {labels.editButton}
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={labels.editTransaction}
        description={fill(labels.transactionFor, { name: bill.name, period: transaction.periodLabel })}
      >
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="obligationId" value={transaction.obligationId} />
          <input type="hidden" name="periodLabel" value={transaction.periodLabel} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={labels.amount}
              name="amount"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={transaction.amountMinor / 100}
            />
            <CurrencyField value={transaction.currency} required labels={labels.currency} />
          </div>
          <TransactionDetailFields bill={bill} initial={transaction} labels={labels} {...choices} />
          <Field
            label={labels.paidOn}
            name="paidOn"
            type="date"
            defaultValue={transaction.paidOn ?? undefined}
            hint={labels.paidOnHint}
          />
          <Submit label={labels.saveChanges} pendingLabel={labels.saving} />
        </form>
      </Sheet>
    </>
  );
}

/**
 * Removing a recorded transaction — the "remove" half of "Add transaction"
 * (CLAUDE.md principle 12). Lives behind a transaction row's own chevron.
 */
export function RemoveTransactionControl({
  householdId,
  transaction,
  label,
  labels,
}: {
  householdId: string;
  transaction: TransactionInitial;
  label: string;
  labels: BillFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    removeTransactionAction,
    {},
  );

  return (
    <>
      <Pill
        type="button"
        tone="quiet"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-[var(--wh-risk)]"
      >
        <Trash2 aria-hidden className="size-3.5" /> {labels.remove}
      </Pill>

      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={labels.removeTransaction}
        description={fill(labels.removeTransactionDescription, { name: label, period: transaction.periodLabel })}
        confirmLabel={labels.remove}
        destructive
        pending={pending}
        onConfirm={() => {
          const formData = new FormData();
          formData.set("householdId", householdId);
          formData.set("obligationId", transaction.obligationId);
          formData.set("periodLabel", transaction.periodLabel);
          startTransition(() => formAction(formData));
        }}
      >
        {state.error ? <p className="text-sm text-[var(--wh-risk)]">{state.error}</p> : null}
      </ConfirmationSheet>
    </>
  );
}

export type BudgetInitial = {
  id: string;
  category: string;
  period: "month" | "quarter" | "year";
  limitMinor: number;
  currency: string;
};

const BUDGET_PERIODS: BudgetInitial["period"][] = ["month", "quarter", "year"];

function BudgetFields({
  householdId,
  initial,
  state,
  defaultCurrency = "INR",
  labels,
}: {
  householdId: string;
  initial?: BudgetInitial;
  state: ActionState;
  defaultCurrency?: string;
  labels: BillFormLabels;
}) {
  const selectClass =
    "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";
  return (
    <>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="budget-category" className="block text-sm font-medium">
            {labels.budgetFor}
          </label>
          <select id="budget-category" name="category" defaultValue={initial?.category ?? "utility"} className={selectClass}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {labels.kinds[k.value] ?? k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="budget-period" className="block text-sm font-medium">
            {labels.budgetHowOften}
          </label>
          <select id="budget-period" name="period" defaultValue={initial?.period ?? "month"} className={selectClass}>
            {BUDGET_PERIODS.map((period) => (
              <option key={period} value={period}>
                {labels.budgetPeriods[period]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={labels.budgetUpTo}
          name="amount"
          type="number"
          min={0.01}
          step="0.01"
          required
          placeholder="5000"
          defaultValue={initial ? initial.limitMinor / 100 : undefined}
        />
        <CurrencyField value={initial?.currency ?? defaultCurrency} labels={labels.currency} />
      </div>
      <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.budgetCurrencyNote}</p>
    </>
  );
}

/** "Set a budget" — planning only; a budget never blocks a bill. */
export function AddBudgetButton({
  householdId,
  defaultCurrency,
  labels,
}: {
  householdId: string;
  defaultCurrency?: string;
  labels: BillFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(saveBudgetAction, {});
  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {labels.budgetSet}
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title={labels.budgetSet} description={labels.budgetSetDescription}>
        <form action={formAction} className="space-y-3">
          <BudgetFields householdId={householdId} state={state} defaultCurrency={defaultCurrency} labels={labels} />
          <Submit label={labels.budgetSave} pendingLabel={labels.saving} />
        </form>
      </Sheet>
    </>
  );
}

/** Changing or removing a budget already set — the other two thirds of "Set a budget". */
export function BudgetRowControls({
  householdId,
  budget,
  labels,
}: {
  householdId: string;
  budget: BudgetInitial;
  labels: BillFormLabels;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [editState, editAction] = useActionState<ActionState, FormData>(saveBudgetAction, {});
  const [removeState, removeAction, removing] = useActionState<ActionState, FormData>(retireBudgetAction, {});
  // A stored kind this screen does not know is shown as it was saved, never translated.
  const kind = labels.kinds[budget.category] ?? budget.category;
  const name = fill(labels.budgetName, { kind });
  const editLabel = fill(labels.edit, { name });
  const removeLabel = fill(labels.removeNamed, { name });
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Pill type="button" tone="quiet" onClick={() => setEditOpen(true)} aria-label={editLabel} title={editLabel}>
        <Pencil aria-hidden className="size-3.5" />
      </Pill>
      <Pill type="button" tone="quiet" onClick={() => setRemoveOpen(true)} aria-label={removeLabel} title={removeLabel}>
        <Trash2 aria-hidden className="size-3.5" />
      </Pill>
      <Sheet open={editOpen} onOpenChange={setEditOpen} title={editLabel} description={labels.budgetEditDescription}>
        <form action={editAction} className="space-y-3">
          <BudgetFields householdId={householdId} initial={budget} state={editState} labels={labels} />
          <Submit label={labels.saveChanges} pendingLabel={labels.saving} />
        </form>
      </Sheet>
      <ConfirmationSheet
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={fill(labels.budgetRemoveTitle, { kind: labels.kindsInSentence[budget.category] ?? budget.category })}
        description={labels.budgetRemoveDescription}
        confirmLabel={labels.remove}
        destructive
        pending={removing}
        onConfirm={() => {
          const formData = new FormData();
          formData.set("householdId", householdId);
          formData.set("id", budget.id);
          startTransition(() => removeAction(formData));
        }}
      >
        {removeState.error ? <p className="text-sm text-[var(--wh-risk)]">{removeState.error}</p> : null}
      </ConfirmationSheet>
    </div>
  );
}

export type BillPeriodLabels = {
  /** `{month}` is the period's month, in the reader's words. */
  fill: string;
  /** `{name}` is the bill's own name, `{month}` its month. */
  fillTitle: string;
  fillDescription: string;
  amount: string;
  paidOn: string;
  save: string;
  saving: string;
  clear: string;
};

/**
 * One of a bill's months, filled in (11-010): what it comes to, and the day
 * it was paid if it has been. The amount starts from what the bill says, or
 * what it usually is; a paid day marks it paid, ahead of time too.
 */
export function BillPeriodButton({
  householdId,
  obligationId,
  billName,
  periodLabel,
  month,
  amountMinor,
  suggestedMinor,
  currency,
  given,
  labels,
}: {
  householdId: string;
  obligationId: string;
  billName: string;
  periodLabel: string;
  month: string;
  amountMinor: number | null;
  /** The usual amount, offered as the starting value when nothing is in yet. */
  suggestedMinor: number | null;
  currency: string;
  /** An amount someone gave ahead, which "Clear" takes back out. */
  given: boolean;
  labels: BillPeriodLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(fillBillPeriodAction, {});
  const start = amountMinor ?? suggestedMinor;
  const title = fill(labels.fill, { month });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title}
        title={title}
        className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
      >
        <Pencil aria-hidden className="size-4" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={fill(labels.fillTitle, { name: billName, month })} description={labels.fillDescription}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="obligationId" value={obligationId} />
          <input type="hidden" name="periodLabel" value={periodLabel} />
          <input type="hidden" name="currency" value={currency} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${labels.amount} (${currency})`} name="amount" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={start !== null ? start / 100 : undefined} />
            <Field label={labels.paidOn} name="paidOn" type="date" />
          </div>
          <Submit label={labels.save} pendingLabel={labels.saving} />
        </form>
        {given ? (
          <form action={formAction} className="mt-2">
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="obligationId" value={obligationId} />
            <input type="hidden" name="periodLabel" value={periodLabel} />
            <input type="hidden" name="amount" value="" />
            <Button type="submit" variant="secondary" className="w-full">
              {labels.clear}
            </Button>
          </form>
        ) : null}
      </Sheet>
    </>
  );
}
