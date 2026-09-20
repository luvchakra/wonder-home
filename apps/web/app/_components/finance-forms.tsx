"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { createObligationAction } from "../(auth)/finance-actions";

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

/** "Add a bill" as a sheet — there was no way onto this page's data without a live connector or the AI chat link. */
export function AddBillButton({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createObligationAction, {});

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Add a bill
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Add a bill" description="WonderHome tracks it from here — no connector needed.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field label="What's the bill?" name="name" required placeholder="Electricity" autoComplete="off" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="kind" className="block text-sm font-medium">Kind</label>
              <select
                id="kind"
                name="kind"
                defaultValue="utility"
                className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="recurrence" className="block text-sm font-medium">Recurs</label>
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
          </div>
          <Field label="Payee (optional)" name="payee" placeholder="State Electricity Board" autoComplete="off" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (optional)" name="amountMinor" type="number" min={0} placeholder="in paise, e.g. 250000" hint="₹2,500 is 250000." />
            <Field label="Currency" name="currency" placeholder="INR" defaultValue="INR" maxLength={3} autoComplete="off" />
          </div>
          <Field label="Due (optional)" name="dueOn" type="date" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add bill"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
