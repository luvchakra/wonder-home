"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeCalendarReminderAction } from "../../(auth)/notification-actions";

export type RemoveReminderLabels = { remove: string; failed: string };

/**
 * Takes the viewer's own reminder off the Calendar (26-025): it is dismissed,
 * as "Not needed" in Notifications, so it leaves both. An icon with its own
 * label, beside the row (rules 4 and 11).
 */
export function RemoveReminder({ householdId, notificationId, labels }: { householdId: string; notificationId: string; labels: RemoveReminderLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label={labels.remove}
        disabled={pending}
        className="inline-flex size-11 items-center justify-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-60"
        onClick={() =>
          start(async () => {
            const result = await removeCalendarReminderAction({ householdId, notificationId });
            if (result.error) return setError(result.error || labels.failed);
            router.refresh();
          })
        }
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {error ? (
        <span role="alert" className="max-w-40 text-right text-xs text-[var(--wh-risk)]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
