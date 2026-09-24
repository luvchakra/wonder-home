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
  recordAmountAction,
  removeTransactionAction,
  updateObligationAction,
} from "../(auth)/finance-actions";
import { CurrencyField } from "./currency-field";

const KINDS = [
  { value: "utility", label: "Utility" },
  { value: "rent", label: "Rent" },
  { value: "school_fee", label: "School fee" },
  { value: "subscription", label: "Subscription" },
  { value: "insurance", label: "Insurance" },
  { value: "loan", label: "Loan" },
  { value: "tax", label: "Tax" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
];

export type ObligationInitial = {
  id: string;
  name: string;
  kind: string;
  payee: string | null;
  amountMinor: number | null;
  currency: string | null;
  dueOn: string | null;
};

function currentPeriodLabel(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** The fields "add" and "edit" share — only the action, the heading and the submit label differ. */
function ObligationFields({
  householdId,
  initial,
  state,
  defaultCurrency = "INR",
}: {
  householdId: string;
  initial?: ObligationInitial;
  state: ActionState;
  /** The household's currency, for a new bill (story 22-007). A bill already on record keeps its own. */
  defaultCurrency?: string;
}) {
  return (
    <>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <Field
        label="What's the bill?"
        name="name"
        required
        placeholder="Electricity"
        autoComplete="off"
        defaultValue={initial?.name}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="kind" className="block text-sm font-medium">
            Kind
          </label>
          <select
            id="kind"
            name="kind"
            defaultValue={initial?.kind ?? "utility"}
            className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        {initial ? null : (
          <div className="space-y-1.5">
            <label htmlFor="recurrence" className="block text-sm font-medium">
              Recurs
            </label>
            <select
              id="recurrence"
              name="recurrence"
              defaultValue="monthly"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="one_off">One-off</option>
            </select>
          </div>
        )}
      </div>
      <Field
        label="Payee (optional)"
        name="payee"
        placeholder="State Electricity Board"
        autoComplete="off"
        defaultValue={initial?.payee ?? undefined}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Amount (optional)"
          name="amount"
          type="number"
          min={0}
          step="0.01"
          placeholder="2500"
          defaultValue={
            initial?.amountMinor != null ? initial.amountMinor / 100 : undefined
          }
        />
        <CurrencyField value={initial?.currency ?? defaultCurrency} />
      </div>
      <Field
        label="Due (optional)"
        name="dueOn"
        type="date"
        defaultValue={initial?.dueOn ?? undefined}
      />
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
export function AddBillButton({ householdId, defaultCurrency }: { householdId: string; defaultCurrency?: string }) {
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
        <Plus aria-hidden className="size-3.5" /> Add a bill
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Add a bill"
        description="WonderHome tracks it from here — no connector needed."
      >
        <form action={formAction} className="space-y-3">
          <ObligationFields householdId={householdId} state={state} defaultCurrency={defaultCurrency} />
          <Submit label="Add bill" pendingLabel="Adding…" />
        </form>
      </Sheet>
    </>
  );
}

/** Editing or standing down a bill already on the list — the update and cancel half of "Add a bill". */
export function ObligationRowControls({
  householdId,
  bill,
}: {
  householdId: string;
  bill: ObligationInitial;
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

  return (
    <div className="flex items-center gap-1.5">
      <Pill
        type="button"
        tone="quiet"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${bill.name}`}
        title={`Edit ${bill.name}`}
      >
        <Pencil aria-hidden className="size-3.5" />
      </Pill>
      <form action={cancelAction}>
        <input type="hidden" name="id" value={bill.id} />
        <input type="hidden" name="householdId" value={householdId} />
        <CancelSubmit name={bill.name} />
      </form>
      {cancelState.error ? (
        <p className="text-xs text-[var(--wh-risk)]">{cancelState.error}</p>
      ) : null}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Edit ${bill.name}`}
        description="Change what WonderHome knows about this bill."
      >
        <form action={editAction} className="space-y-3">
          <ObligationFields
            householdId={householdId}
            initial={bill}
            state={editState}
          />
          <Submit label="Save changes" pendingLabel="Saving…" />
        </form>
      </Sheet>
    </div>
  );
}

function CancelSubmit({ name }: { name: string }) {
  const { pending } = useFormStatus();
  const label = `Cancel ${name}`;
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

/** The words a bill's own kind is shown in, so a transaction defaults to the same ones. */
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
}: TransactionChoices & {
  bill: TransactionBill | undefined;
  initial?: TransactionInitial;
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
        label="Payee (optional)"
        name="payee"
        options={withCurrent(payeeOptions, payee)}
        defaultValue={payee}
        placeholder="Choose who was paid"
        emptyLabel="Not recorded"
        addNewLabel="Add a new payee…"
        newValuePlaceholder="State Electricity Board"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <ComboboxField
          label="Kind (optional)"
          name="kind"
          options={withCurrent(kinds, kind)}
          defaultValue={kind}
          placeholder="Choose a kind"
          emptyLabel="Not recorded"
          addNewLabel="Add a new kind…"
          newValuePlaceholder="e.g. Maintenance"
        />
        <Select label="Owner (optional)" name="ownerMemberId" defaultValue={owner}>
          <option value="">No one in particular</option>
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
  ...choices
}: TransactionChoices & {
  householdId: string;
  bills: TransactionBill[];
  /** For a bill with no currency of its own yet (story 22-007). */
  defaultCurrency?: string;
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
        <Plus aria-hidden className="size-3.5" /> Add transaction
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Add transaction"
        description="Record what a bill actually came to for a period."
      >
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Select
            label="Which bill?"
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
            label="Period"
            name="periodLabel"
            required
            placeholder="2026-09"
            defaultValue={currentPeriodLabel()}
            autoComplete="off"
            hint="Whatever the bill's own cycle is — a month, a quarter, a term."
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Amount"
              name="amount"
              type="number"
              min={0}
              step="0.01"
              required
              placeholder="2500"
            />
            <CurrencyField key={`currency-${bill?.id}`} value={bill?.currency ?? defaultCurrency} required />
          </div>
          {/* Keyed by bill, so choosing another bill brings in that bill's own payee, kind and owner. */}
          <TransactionDetailFields key={bill?.id} bill={bill} {...choices} />
          <Field
            label="Paid on (optional)"
            name="paidOn"
            type="date"
            hint="When the household actually paid — separate from the period it covers."
          />
          <Submit label="Record" pendingLabel="Recording…" />
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
  ...choices
}: TransactionChoices & {
  householdId: string;
  bill: TransactionBill;
  transaction: TransactionInitial;
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
        <Pencil aria-hidden className="size-3.5" /> Edit
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Edit transaction"
        description={`${bill.name} for ${transaction.periodLabel}.`}
      >
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="obligationId" value={transaction.obligationId} />
          <input type="hidden" name="periodLabel" value={transaction.periodLabel} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Amount"
              name="amount"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={transaction.amountMinor / 100}
            />
            <CurrencyField value={transaction.currency} required />
          </div>
          <TransactionDetailFields bill={bill} initial={transaction} {...choices} />
          <Field
            label="Paid on (optional)"
            name="paidOn"
            type="date"
            defaultValue={transaction.paidOn ?? undefined}
            hint="When the household actually paid — separate from the period it covers."
          />
          <Submit label="Save changes" pendingLabel="Saving…" />
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
}: {
  householdId: string;
  transaction: TransactionInitial;
  label: string;
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
        <Trash2 aria-hidden className="size-3.5" /> Remove
      </Pill>

      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={`Remove this transaction?`}
        description={`${label} for ${transaction.periodLabel} will no longer be recorded. This can't be undone, but you can always add it again.`}
        confirmLabel="Remove"
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
