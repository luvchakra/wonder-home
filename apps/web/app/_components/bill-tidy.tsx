"use client";

import { Sparkles } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Button } from "@wonderhome/core/ui/button";
import { Badge, Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { markBillsPaidAction, removeBillsAction } from "../(auth)/finance-actions";

/** One bill as "Tidy up" shows it: words worked out on the server. */
export type TidyRow = { id: string; name: string; detail: string; checking: string | null };

export type TidyLabels = {
  open: string;
  title: string;
  description: string;
  same: string;
  keepOne: string;
  pick: string;
  /** With `{count}`. */
  removeSelected: string;
  confirmTitle: string;
  confirmDescription: string;
  noDuplicates: string;
  remove: string;
  /** With `{count}`. */
  markSelected: string;
  paidTitle: string;
  paidDescription: string;
  paidConfirm: string;
};

export type TidyGroup = { reason: string; ids: string[]; keepId: string; keepNote: string };

/**
 * "Tidy up" on the bills list (the owner, 2026-11-20: "there should be option
 * to clean up easily"). A quiet entry, not a checkbox on every row: it opens
 * the bills that look entered twice — each with its plain reason from the
 * records and a suggested one to keep, the person choosing — and the whole
 * list to tick and remove. Every removal is one yes that lists the bills
 * (`finance/remove-bills.ts`); nothing is removed by default, nothing paid.
 */
export function BillTidyButton({
  householdId,
  rows,
  sections,
  groups,
  labels,
  today,
}: {
  householdId: string;
  /** The household's today (YYYY-MM-DD), the day "Mark selected as paid" records. */
  today: string;
  rows: TidyRow[];
  /** The list to pick from, a kind's bills together: `label` is the kind ("Electricity"), null for a bill on its own. */
  sections: { label: string | null; ids: string[] }[];
  groups: TidyGroup[];
  labels: TidyLabels;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [kept, setKept] = useState<Record<string, string>>(() => Object.fromEntries(groups.map((group, index) => [index, group.keepId])));
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [marking, setMarking] = useState<string[] | null>(null);
  // Once removed, the sheets close and the list reloads without those bills.
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (previous, formData) => {
    const result = await removeBillsAction(previous, formData);
    if (result.notice) {
      setConfirming(null);
      setPicked(new Set());
      setOpen(false);
    }
    return result;
  }, {});
  const [paidState, paidAction, paidPending] = useActionState<ActionState, FormData>(async (previous, formData) => {
    const result = await markBillsPaidAction(previous, formData);
    if (result.notice) {
      setMarking(null);
      setPicked(new Set());
      setOpen(false);
    }
    return result;
  }, {});
  const byId = new Map(rows.map((row) => [row.id, row]));

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="gap-1.5">
        <Sparkles aria-hidden className="size-3.5" /> {labels.open}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={labels.title} description={labels.description}>
        <div className="space-y-5">
          <section>
            <p className="mb-2 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{labels.same}</p>
            {groups.length === 0 ? (
              <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.noDuplicates}</p>
            ) : (
              <ul className="space-y-3">
                {groups.map((group, index) => {
                  const keep = kept[index] ?? group.keepId;
                  return (
                    <li key={group.ids.join(":")} className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
                      <fieldset className="space-y-1.5">
                        <legend className="mb-2 text-sm font-medium break-words">{group.reason}</legend>
                        {group.ids.map((id) => {
                          const row = byId.get(id);
                          if (!row) return null;
                          return (
                            <label key={id} className="flex cursor-pointer items-start gap-2.5 rounded-[var(--wh-radius-sm)] p-1.5 hover:bg-[var(--wh-surface)]">
                              <input
                                type="radio"
                                name={`keep-${index}`}
                                checked={keep === id}
                                onChange={() => setKept((current) => ({ ...current, [index]: id }))}
                                className="mt-1 size-4 shrink-0 accent-[var(--wh-primary)]"
                              />
                              <RowWords row={row} note={id === group.keepId ? group.keepNote : null} />
                            </label>
                          );
                        })}
                      </fieldset>
                      <div className="mt-2">
                        <Pill type="button" tone="quiet" className="text-[var(--wh-risk)]" onClick={() => setConfirming(group.ids.filter((id) => id !== keep))}>
                          {labels.keepOne}
                        </Pill>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{labels.pick}</p>
            <div className="space-y-3">
              {sections.map((section) => (
                <div key={section.ids.join(":")}>
                  {section.label ? <p className="mb-1 text-sm font-semibold">{section.label}</p> : null}
                  <ul className="divide-y divide-[var(--wh-border)] rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)]">
                    {section.ids.map((id) => {
                      const row = byId.get(id);
                      if (!row) return null;
                      return (
                        <li key={id}>
                          <label className="flex cursor-pointer items-start gap-2.5 p-2.5">
                            <input type="checkbox" checked={picked.has(id)} onChange={() => toggle(id)} className="mt-1 size-4 shrink-0 accent-[var(--wh-primary)]" />
                            <RowWords row={row} note={null} />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" disabled={picked.size === 0} onClick={() => setMarking([...picked])}>
                {labels.markSelected.replace("{count}", String(picked.size))}
              </Button>
              <Button type="button" variant="secondary" disabled={picked.size === 0} onClick={() => setConfirming([...picked])}>
                {labels.removeSelected.replace("{count}", String(picked.size))}
              </Button>
            </div>
          </section>
        </div>
      </Sheet>

      {/* One yes for the lot, naming every bill that goes. */}
      <ConfirmationSheet
        open={confirming !== null}
        onOpenChange={(next) => (next ? undefined : setConfirming(null))}
        title={labels.confirmTitle}
        description={labels.confirmDescription}
        confirmLabel={labels.remove}
        destructive
        pending={pending}
        onConfirm={() => {
          if (!confirming || confirming.length === 0) return;
          const formData = new FormData();
          formData.set("householdId", householdId);
          for (const id of confirming) formData.append("id", id);
          startTransition(() => formAction(formData));
        }}
      >
        <ul className="space-y-1.5">
          {(confirming ?? []).map((id) => {
            const row = byId.get(id);
            return row ? (
              <li key={id} className="text-sm">
                <span className="font-medium break-words">{row.name}</span>
                <span className="block text-xs text-[var(--wh-foreground-subtle)]">{row.detail}</span>
              </li>
            ) : null;
          })}
        </ul>
        {state.error ? <p className="mt-2 text-sm text-[var(--wh-risk)]">{state.error}</p> : null}
      </ConfirmationSheet>
      {/* Bills paid elsewhere, cleared with one yes that names them; WonderHome pays nothing. */}
      <ConfirmationSheet
        open={marking !== null}
        onOpenChange={(next) => (next ? undefined : setMarking(null))}
        title={labels.paidTitle}
        description={labels.paidDescription}
        confirmLabel={labels.paidConfirm}
        pending={paidPending}
        onConfirm={() => {
          if (!marking || marking.length === 0) return;
          const formData = new FormData();
          formData.set("householdId", householdId);
          formData.set("paidOn", today);
          for (const id of marking) formData.append("id", id);
          startTransition(() => paidAction(formData));
        }}
      >
        <ul className="space-y-1.5">
          {(marking ?? []).map((id) => {
            const row = byId.get(id);
            return row ? (
              <li key={id} className="text-sm">
                <span className="font-medium break-words">{row.name}</span>
                <span className="block text-xs text-[var(--wh-foreground-subtle)]">{row.detail}</span>
              </li>
            ) : null;
          })}
        </ul>
        {paidState.error ? <p className="mt-2 text-sm text-[var(--wh-risk)]">{paidState.error}</p> : null}
      </ConfirmationSheet>
    </>
  );
}

function RowWords({ row, note }: { row: TidyRow; note: string | null }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium break-words">
        {row.name}
        {row.checking ? (
          <Badge tone="attention" className="ml-2 align-middle">
            {row.checking}
          </Badge>
        ) : null}
      </span>
      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{row.detail}</span>
      {note ? <span className="block text-xs font-medium text-[var(--wh-handled)]">{note}</span> : null}
    </span>
  );
}
