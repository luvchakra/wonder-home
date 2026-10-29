"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { PaidBill } from "@wonderhome/core/finance/repository";

import { markBillPaidAction, undoBillPaidAction } from "../(auth)/finance-actions";

export type MarkPaidLabels = {
  button: string;
  title: string;
  description: string;
  amount: string;
  paidOn: string;
  confirm: string;
  saving: string;
  done: string;
  undo: string;
  undone: string;
  failed: string;
};

const UNDO_WINDOW_MS = 8000;

/**
 * "Mark paid" on a bill row: one tap opens a small confirm (paid today, the
 * bill's own amount, both editable). It records that a person paid, through
 * the same write HomeTalk's "paid" uses; WonderHome never pays. The row steps
 * aside with an Undo for a few seconds, then the page refreshes without it.
 */
export function MarkBillPaidButton({
  householdId,
  obligationId,
  billName,
  today,
  amountMinor,
  currency,
  exponent,
  labels,
}: {
  householdId: string;
  obligationId: string;
  billName: string;
  /** The household's today, as YYYY-MM-DD. */
  today: string;
  amountMinor: number | null;
  /** The bill's own currency, else the household's. */
  currency: string;
  /** Decimal places of the currency, so money stays decimal (rule 22). */
  exponent: number;
  labels: MarkPaidLabels;
}) {
  const router = useRouter();
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<PaidBill | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const row = () => anchor.current?.closest("li") ?? null;
  const name = billName;
  const say = (text: string) => text.replace("{name}", name);

  // The row steps aside while Undo is on offer; the page refreshes when it lapses.
  useEffect(() => {
    if (!paid) return;
    const li = row();
    if (li) li.style.display = "none";
    const timer = setTimeout(() => {
      setPaid(null);
      setNote(null);
      router.refresh();
    }, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [paid, router]);

  function confirm(form: HTMLFormElement) {
    const data = new FormData(form);
    const raw = String(data.get("amount") ?? "").trim();
    const amount = raw === "" ? null : Number(raw);
    if (amount !== null && !Number.isFinite(amount)) return setError(labels.failed);
    setError(null);
    startTransition(async () => {
      try {
        const result = await markBillPaidAction({ householdId, obligationId, paidOn: String(data.get("paidOn") ?? today), amount, currency: amount === null ? null : currency });
        if (result.error || !result.paid) return setError(result.error ?? labels.failed);
        setOpen(false);
        setNote(say(labels.done));
        setPaid(result.paid);
      } catch {
        setError(labels.failed);
      }
    });
  }

  function undo() {
    if (!paid) return;
    const taken = paid;
    startTransition(async () => {
      try {
        const result = await undoBillPaidAction({ householdId, obligationId, paid: taken });
        if (result.error) return setError(result.error);
        const li = row();
        if (li) li.style.display = "";
        setNote(labels.undone);
        setPaid(null);
        setTimeout(() => setNote(null), 3000);
        router.refresh();
      } catch {
        setError(labels.failed);
      }
    });
  }

  return (
    <span ref={anchor} className="flex flex-col items-end gap-1">
      <Pill type="button" tone="primary" onClick={() => setOpen(true)}>
        {labels.button}
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title={say(labels.title)} description={labels.description}>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            confirm(event.currentTarget);
          }}
        >
          {error ? <Alert>{error}</Alert> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${labels.amount} (${currency})`} name="amount" type="number" min={0} step={(1 / 10 ** exponent).toFixed(exponent)} inputMode="decimal" defaultValue={amountMinor !== null ? (amountMinor / 10 ** exponent).toFixed(exponent) : undefined} />
            <Field label={labels.paidOn} name="paidOn" type="date" defaultValue={today} required />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? labels.saving : labels.confirm}
          </Button>
        </form>
      </Sheet>
      {note ? (
        <span role="status" className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-[var(--wh-foreground)] px-4 py-3 text-sm text-[var(--wh-background)] shadow-lg">
          <span>{note}</span>
          {paid ? (
            <button type="button" onClick={undo} disabled={pending} className="min-h-11 shrink-0 px-2 font-semibold underline">
              {labels.undo}
            </button>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
