"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { PAID_WITH, type PaidWith } from "@wonderhome/core/finance/part-payment";
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
  paidBy: string;
  paidBySomeone: string;
  howMuch: string;
  full: string;
  part: string;
  paidWith: string;
  paidWithNotSaid: string;
  partDone: string;
  methods: Record<PaidWith, string>;
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
  members,
  defaultPayerId,
  paidLine,
  tone = "primary",
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
  /** The adults who could have paid, for "Who paid" (a choice is picked, not typed). */
  members?: { id: string; name: string }[];
  /** Whoever handles the bill, picked to start with. */
  defaultPayerId?: string | null;
  /** "₹500 paid · ₹700 left" when part of it is paid already (11-019); amountMinor is then what is left. */
  paidLine?: string | null;
  tone?: "primary" | "quiet";
}) {
  const router = useRouter();
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<PaidBill | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [part, setPart] = useState(false);

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
        const payer = String(data.get("paidBy") ?? "");
        const method = String(data.get("paidWith") ?? "");
        const paidWith = (PAID_WITH as readonly string[]).includes(method) ? (method as PaidWith) : null;
        const result = await markBillPaidAction({ householdId, obligationId, paidOn: String(data.get("paidOn") ?? today), amount, currency: amount === null ? null : currency, paidByMemberId: payer === "" ? null : payer, paidWith, part });
        if (result.error || !result.paid) return setError(result.error ?? labels.failed);
        setOpen(false);
        setNote(say(result.paid.partial ? labels.partDone : labels.done));
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
      <Pill type="button" tone={tone} onClick={() => setOpen(true)}>
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
          {paidLine ? <p className="text-sm text-[var(--wh-foreground-muted)]">{paidLine}</p> : null}
          {amountMinor !== null ? (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{labels.howMuch}</legend>
              <div className="flex flex-wrap gap-2">
                {([false, true] as const).map((value) => (
                  <label key={String(value)} className="flex min-h-11 items-center gap-2 rounded-full border border-[var(--wh-border)] px-3 text-sm">
                    <input type="radio" name="part" checked={part === value} onChange={() => setPart(value)} />
                    {value ? labels.part : labels.full}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${labels.amount} (${currency})`} name="amount" type="number" min={0} step={(1 / 10 ** exponent).toFixed(exponent)} inputMode="decimal" defaultValue={amountMinor !== null ? (amountMinor / 10 ** exponent).toFixed(exponent) : undefined} />
            <Field label={labels.paidOn} name="paidOn" type="date" defaultValue={today} required />
          </div>
          <Select label={labels.paidWith} name="paidWith" defaultValue="">
            <option value="">{labels.paidWithNotSaid}</option>
            {PAID_WITH.map((method) => (
              <option key={method} value={method}>
                {labels.methods[method]}
              </option>
            ))}
          </Select>
          {members && members.length > 0 ? (
            <Select label={labels.paidBy} name="paidBy" defaultValue={defaultPayerId ?? ""}>
              <option value="">{labels.paidBySomeone}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          ) : null}
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
