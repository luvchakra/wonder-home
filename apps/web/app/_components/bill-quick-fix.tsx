"use client";

import { BellOff, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@wonderhome/core/ui/button";

import { quickFixBillAction, snoozeBillAction } from "../(auth)/bill-quick-actions";

export type QuickFixLabels = { edit: string; save: string; cancel: string; saved: string; failed: string; someone: string; snooze: string; snoozeDay: string; snoozed: string };

type Field =
  | { kind: "dueOn"; value: string | null }
  | { kind: "amount"; value: number | null; currency: string; exponent: number }
  | { kind: "owner"; value: string | null; members: { id: string; name: string }[] };

/**
 * One fact on a bill row, fixed in place (11-023): tap the pencil beside the
 * due date, the amount or who handles it, change that one thing, save. The
 * row's editor still holds everything else.
 */
export function QuickFix({ householdId, obligationId, label, field, labels }: { householdId: string; obligationId: string; label: string; field: Field; labels: QuickFixLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function save(form: HTMLFormElement) {
    const data = new FormData(form);
    const raw = String(data.get("value") ?? "").trim();
    start(async () => {
      const result =
        field.kind === "dueOn"
          ? await quickFixBillAction({ field: "dueOn", householdId, obligationId, dueOn: raw })
          : field.kind === "amount"
            ? await quickFixBillAction({ field: "amount", householdId, obligationId, amount: raw === "" ? null : Number(raw), currency: field.currency })
            : await quickFixBillAction({ field: "owner", householdId, obligationId, memberId: raw === "" ? null : raw });
      if (result.error) return setMessage(result.error);
      setOpen(false);
      setMessage(labels.saved);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" aria-label={`${labels.edit}: ${label}`} onClick={() => setOpen(true)} className="inline-flex size-11 items-center justify-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]">
          <Pencil aria-hidden className="size-3.5" />
        </button>
        {message ? <span role="status" className="text-xs text-[var(--wh-foreground-muted)]">{message}</span> : null}
      </span>
    );
  }
  const input =
    field.kind === "dueOn" ? (
      <input name="value" type="date" required defaultValue={field.value ?? ""} aria-label={label} className="min-h-11 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm" />
    ) : field.kind === "amount" ? (
      <input name="value" type="number" min={0} step={(1 / 10 ** field.exponent).toFixed(field.exponent)} inputMode="decimal" defaultValue={field.value !== null ? (field.value / 10 ** field.exponent).toFixed(field.exponent) : ""} aria-label={`${label} (${field.currency})`} className="min-h-11 w-32 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm" />
    ) : (
      <select name="value" defaultValue={field.value ?? ""} aria-label={label} className="min-h-11 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm">
        <option value="">{labels.someone}</option>
        {field.members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
    );
  return (
    <form
      className="col-span-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save(event.currentTarget);
      }}
    >
      {input}
      <Button type="submit" disabled={pending}>
        {labels.save}
      </Button>
      <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
        {labels.cancel}
      </Button>
      {message ? <span role="alert" className="text-xs text-[var(--wh-risk)]">{message || labels.failed}</span> : null}
    </form>
  );
}

/** "Remind me on…" (11-023): the viewer's own reminder about this bill waits until that morning. */
export function SnoozeBillReminder({ householdId, obligationId, today, labels }: { householdId: string; obligationId: string; today: string; labels: QuickFixLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {open ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const day = String(new FormData(event.currentTarget).get("day") ?? "");
            start(async () => {
              const result = await snoozeBillAction({ householdId, obligationId, day });
              if (result.error) return setMessage(result.error);
              setOpen(false);
              setMessage(labels.snoozed);
              router.refresh();
            });
          }}
        >
          <input name="day" type="date" required min={today} aria-label={labels.snoozeDay} className="min-h-11 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm" />
          <Button type="submit" disabled={pending}>
            {labels.save}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--wh-primary)]">
          <BellOff aria-hidden className="size-4" />
          {labels.snooze}
        </button>
      )}
      {message ? <p role="status" className="text-sm text-[var(--wh-foreground-muted)]">{message}</p> : null}
    </div>
  );
}
