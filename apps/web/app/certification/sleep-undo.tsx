"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { undoSleepChangeAction } from "../(auth)/homebrain-sleep-actions";

const ICON_BUTTON =
  "grid size-11 place-items-center rounded-full border border-[var(--wh-border)] text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50";

/** Undo one change a night's sleep made, or bring a resting memory back (HomeBrain Sleep). An icon with its own label (rule 11). */
export function SleepUndoButton({ householdId, consolidationId, label, failed }: { householdId: string; consolidationId: string; label: string; failed: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={label}
        title={error ?? label}
        className={ICON_BUTTON}
        onClick={() =>
          startTransition(async () => {
            const result = await undoSleepChangeAction({ householdId, consolidationId });
            if (result.ok) router.refresh();
            else setError(failed);
          })
        }
      >
        <RotateCcw aria-hidden className="size-4" />
      </button>
      {error ? (
        <span role="alert" className="sr-only">
          {error}
        </span>
      ) : null}
    </>
  );
}
