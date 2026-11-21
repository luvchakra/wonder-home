"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Pill } from "@wonderhome/core/ui/pill";

import { markBillUnpaidAction } from "../(auth)/finance-actions";

/**
 * "Mark as unpaid" on a settled bill (the owner, 2026-11-21): a mark made by
 * mistake is taken back in one tap. It is a correction to the household's
 * own record — the bill goes back to Upcoming, its recorded payment comes out
 * of the totals — so it needs no yes; nothing is refunded or paid.
 */
export function MarkBillUnpaidButton({
  householdId,
  obligationId,
  billName,
  labels,
}: {
  householdId: string;
  obligationId: string;
  billName: string;
  labels: { button: string; done: string; failed: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function unmark() {
    startTransition(async () => {
      const result = await markBillUnpaidAction({ householdId, obligationId }).catch(() => ({ error: labels.failed }));
      setNote(result.error ?? labels.done.replace("{name}", billName));
      setTimeout(() => setNote(null), 3000);
      if (!result.error) router.refresh();
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Pill type="button" tone="quiet" onClick={unmark} disabled={pending}>
        {labels.button}
      </Pill>
      {note ? (
        <span role="status" className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-sm rounded-2xl bg-[var(--wh-foreground)] px-4 py-3 text-sm text-[var(--wh-background)] shadow-lg">
          {note}
        </span>
      ) : null}
    </span>
  );
}
