"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import { attachBillFileAction, removeBillFileAction, type BillFileState } from "../../(auth)/bill-file-actions";

export type BillFileLabels = { attach: string; attaching: string; save: string; remove: string; failed: string };

/** "Attach a photo or PDF" on a bill's record (11-021): pick a file, then attach it. */
export function AttachBillFile({ householdId, obligationId, labels }: { householdId: string; obligationId: string; labels: BillFileLabels }) {
  const [state, action, pending] = useActionState<BillFileState, FormData>(attachBillFileAction, {});
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <form action={action} className="space-y-2" onSubmit={() => setChosen(null)}>
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="obligationId" value={obligationId} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-3.5 text-sm font-semibold text-[var(--wh-primary)]">
          <Paperclip aria-hidden className="size-4" />
          {labels.attach}
          <input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(event) => setChosen(event.target.files?.[0]?.name ?? null)} />
        </label>
        {chosen ? (
          <Button type="submit" disabled={pending}>
            {pending ? labels.attaching : labels.save}
          </Button>
        ) : null}
      </div>
      {chosen ? <p className="text-xs break-words text-[var(--wh-foreground-muted)]">{chosen}</p> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <p role="status" className="text-sm text-[var(--wh-handled)]">{state.notice}</p> : null}
    </form>
  );
}

/** Takes one file off the bill's record; the file is kept (rule 12). */
export function RemoveBillFile({ householdId, obligationId, attachmentId, labels }: { householdId: string; obligationId: string; attachmentId: string; labels: BillFileLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-label={labels.remove}
        disabled={pending}
        className="inline-flex size-11 items-center justify-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
        onClick={() =>
          start(async () => {
            const result = await removeBillFileAction({ householdId, obligationId, attachmentId });
            if (result.error) return setError(result.error);
            router.refresh();
          })
        }
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {error ? <span role="alert" className="text-xs text-[var(--wh-risk)]">{error || labels.failed}</span> : null}
    </span>
  );
}
