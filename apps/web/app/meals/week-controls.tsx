"use client";

import { Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Pill } from "@wonderhome/core/ui/pill";

import { copyLastWeekAction } from "../(auth)/meal-actions";

/**
 * "Repeat last week" (the owner, 2026-10-20: weekly meal planning): last
 * week's meals planned again into this week's empty slots, and the result
 * said in words — how many were copied, or that nothing was left to copy.
 */
export function RepeatLastWeek({ householdId, week, labels }: { householdId: string; week: string; labels: { action: string; working: string; copied: string; copiedOne: string; none: string } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill
        type="button"
        tone="quiet"
        disabled={pending}
        className="gap-1.5"
        onClick={() =>
          startTransition(async () => {
            const result = await copyLastWeekAction({ householdId, week });
            if (!result.ok) return setSaid(result.error);
            setSaid(result.copied === 0 ? labels.none : result.copied === 1 ? labels.copiedOne : labels.copied.replace("{count}", String(result.copied)));
            router.refresh();
          })
        }
      >
        <Repeat aria-hidden className="size-3.5" /> {pending ? labels.working : labels.action}
      </Pill>
      {said ? (
        <p role="status" className="text-xs text-[var(--wh-foreground-muted)]">
          {said}
        </p>
      ) : null}
    </div>
  );
}
