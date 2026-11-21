"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Pill } from "@wonderhome/core/ui/pill";

import { setAutopayAction, undoAutopayAction } from "../(auth)/bill-autopay-actions";

export type AutopayLabels = { on: string; off: string; hint: string; failed: string };

/** An Admin's "Usually paid by autopay" switch on a bill (11-024). WonderHome never pays. */
export function BillAutopaySwitch({ householdId, obligationId, on, labels }: { householdId: string; obligationId: string; on: boolean; labels: AutopayLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Pill
        type="button"
        tone={on ? "primary" : "quiet"}
        aria-pressed={on}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await setAutopayAction({ householdId, obligationId, on: !on });
            if (result.error) return setError(result.error || labels.failed);
            router.refresh();
          })
        }
      >
        {on ? labels.on : labels.off}
      </Pill>
      <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.hint}</p>
      {error ? <p role="alert" className="text-sm text-[var(--wh-risk)]">{error}</p> : null}
    </div>
  );
}

/** "Marked as paid by autopay: Airtel, ₹1,500 · Checking · Undo" (11-024). */
export function AutopayRunNote({ householdId, runId, line, labels, highlight }: { householdId: string; runId: string; line: string; labels: { undo: string; undone: string; failed: string }; highlight?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <li id={`autopay-${runId}`} className={`flex flex-wrap items-center gap-2 py-1.5 text-sm ${highlight ? "font-medium" : ""}`}>
      <span className="min-w-0 break-words">{done ? labels.undone : line}</span>
      {done ? null : (
        <button
          type="button"
          className="min-h-11 px-1 font-semibold underline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await undoAutopayAction({ householdId, runId });
              if (result.error) return setError(result.error || labels.failed);
              setDone(true);
              router.refresh();
            })
          }
        >
          {labels.undo}
        </button>
      )}
      {error ? <span role="alert" className="text-[var(--wh-risk)]">{error}</span> : null}
    </li>
  );
}
