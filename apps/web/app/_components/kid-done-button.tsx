"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cn } from "@wonderhome/core/lib/cn";

import { checkInGoalAction, markSchoolWorkAction } from "../(auth)/goal-actions";

/**
 * The child's one tap (story 08-017): "I did it!" on a goal for today or a
 * piece of school work. A done one shows a tick and takes it back on a second
 * tap. The "+2 ⭐" that floats up is decoration; the label already says it.
 */
export function KidDoneButton({
  target,
  done,
  stars,
  labels,
}: {
  target: { kind: "goal"; householdId: string; goalId: string; childMemberId: string } | { kind: "school"; householdId: string; id: string };
  done: boolean;
  stars: number;
  labels: { doIt: string; done: string; undo: string; earned: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(done);
  const [burst, setBurst] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !optimistic;
    setOptimistic(next);
    setError(null);
    if (next) setBurst((count) => count + 1);
    startTransition(async () => {
      const result =
        target.kind === "goal"
          ? await checkInGoalAction({ householdId: target.householdId, goalId: target.goalId, childMemberId: target.childMemberId, done: next })
          : await markSchoolWorkAction({ householdId: target.householdId, id: target.id, done: next });
      if (result.error) {
        setOptimistic(!next);
        setError(result.error);
      } else router.refresh();
    });
  };

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={optimistic}
        aria-label={optimistic ? labels.undo : undefined}
        title={error ?? (optimistic ? labels.undo : undefined)}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-70",
          optimistic
            ? "wh-kid-pop bg-[var(--wh-handled)] text-white"
            : "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] shadow-[0_6px_16px_-6px_var(--wh-primary-glow)] hover:bg-[var(--wh-primary-hover)]",
        )}
      >
        {optimistic ? (
          <>
            <Check aria-hidden className="size-4" /> {labels.done}
          </>
        ) : (
          labels.doIt
        )}
      </button>
      {burst > 0 && optimistic ? (
        <span key={burst} aria-hidden className="wh-kid-burst pointer-events-none absolute -top-2 end-2 text-sm font-bold text-[oklch(0.6_0.16_70)]">
          +{stars} ⭐
        </span>
      ) : null}
      {optimistic && burst > 0 ? (
        <span role="status" className="sr-only">
          {labels.earned}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="sr-only">
          {error}
        </span>
      ) : null}
    </span>
  );
}
