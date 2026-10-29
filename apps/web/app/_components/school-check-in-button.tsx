"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Pill } from "@wonderhome/core/ui/pill";

import { markSchoolWorkAction } from "../(auth)/goal-actions";

/**
 * "Check in" on a missed school item: closes it right here. A link to the page
 * you are already on did nothing, and a failure now says so instead of staying silent.
 */
export function SchoolCheckInButton({ householdId, id, label }: { householdId: string; id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await markSchoolWorkAction({ householdId, id, done: true });
        if (result.error) setError(result.error);
        else router.refresh();
      } catch {
        setError("That didn't save. Please try again.");
      }
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Pill type="button" tone="primary" disabled={pending} onClick={close}>
        {pending ? "Saving…" : label}
      </Pill>
      {error ? (
        <span role="alert" className="max-w-[12rem] text-right text-xs text-[var(--wh-risk,#b42318)]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
