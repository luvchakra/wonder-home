"use client";

import { Ban, Pencil, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  cancelObligationAction,
  createObligationAction,
  recordAmountAction,
  updateObligationAction,
} from "../(auth)/finance-actions";

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
}: {
  householdId: string;
  initial?: ObligationInitial;
  state: ActionState;
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
          name="amountMinor"
          type="number"
          min={0}
          placeholder="in paise, e.g. 250000"
          hint="₹2,500 is 250000."
          defaultValue={initial?.amountMinor ?? undefined}
        />
        <Field
          label="Currency"
          name="currency"
          placeholder="INR"
          defaultValue={initial?.currency ?? "INR"}
          maxLength={3}
          autoComplete="off"
        />
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
export function AddBillButton({ householdId }: { householdId: string }) {
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
          <ObligationFields householdId={householdId} state={state} />
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

/**
 * "Add transaction" as a sheet — the manual half of an imported bill's own
 * amount, recording what a bill actually came to for a period via the same
 * `recordAmount` the email connector already uses.
 */
export function AddTransactionButton({
  householdId,
  bills,
}: {
  householdId: string;
  bills: { id: string; name: string; currency: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    recordAmountAction,
    {},
  );
  const firstBill = bills[0];

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
          <div className="space-y-1.5">
            <label htmlFor="obligationId" className="block text-sm font-medium">
              Which bill?
            </label>
            <select
              id="obligationId"
              name="obligationId"
              defaultValue={firstBill?.id}
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {bills.map((bill) => (
                <option key={bill.id} value={bill.id}>
                  {bill.name}
                </option>
              ))}
            </select>
          </div>
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
              name="amountMinor"
              type="number"
              min={0}
              required
              placeholder="in paise, e.g. 250000"
              hint="₹2,500 is 250000."
            />
            <Field
              label="Currency"
              name="currency"
              required
              placeholder="INR"
              defaultValue={firstBill?.currency ?? "INR"}
              maxLength={3}
              autoComplete="off"
            />
          </div>
          <Submit label="Record" pendingLabel="Recording…" />
        </form>
      </Sheet>
    </>
  );
}
