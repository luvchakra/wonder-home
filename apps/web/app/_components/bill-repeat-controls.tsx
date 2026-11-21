"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Pill } from "@wonderhome/core/ui/pill";

import type { SkippedBill } from "@wonderhome/core/finance/recurring";

import { endBillSeriesAction, restoreBillSeriesAction, skipBillMonthAction, undoSkipAction } from "../(auth)/bill-recurring-actions";

export type RepeatLabels = { skip: string; skipped: string; end: string; ended: string; undo: string; undone: string; failed: string };

/**
 * A recurring bill's own two choices (11-022): skip this month (nothing paid,
 * it moves on) or end after this one. Each happens at once, with Undo.
 */
export function BillRepeatControls({ householdId, obligationId, labels }: { householdId: string; obligationId: string; labels: RepeatLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [undo, setUndo] = useState<(() => Promise<{ error?: string }>) | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(act: () => Promise<{ error?: string; skipped?: SkippedBill; recurrence?: string }>, done: string) {
    setError(null);
    start(async () => {
      const result = await act();
      if (result.error) return setError(result.error);
      setNote(done);
      const skipped = result.skipped;
      const recurrence = result.recurrence;
      setUndo(() =>
        skipped
          ? () => undoSkipAction({ householdId, obligationId, skipped })
          : recurrence
            ? () => restoreBillSeriesAction({ householdId, obligationId, recurrence })
            : null,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Pill type="button" tone="quiet" disabled={pending} onClick={() => run(() => skipBillMonthAction({ householdId, obligationId }), labels.skipped)}>
          {labels.skip}
        </Pill>
        <Pill type="button" tone="quiet" disabled={pending} onClick={() => run(() => endBillSeriesAction({ householdId, obligationId }), labels.ended)}>
          {labels.end}
        </Pill>
      </div>
      {error ? <p role="alert" className="text-sm text-[var(--wh-risk)]">{error}</p> : null}
      {note ? (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
          {note}
          {undo ? (
            <button
              type="button"
              className="min-h-11 px-1 font-semibold underline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await undo();
                  if (result.error) return setError(result.error || labels.failed);
                  setUndo(null);
                  setNote(labels.undone);
                  router.refresh();
                })
              }
            >
              {labels.undo}
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
