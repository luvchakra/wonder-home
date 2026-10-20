"use client";

import { Check, Hourglass } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cn } from "@wonderhome/core/lib/cn";
import { Celebration } from "@wonderhome/core/ui/celebration";

import { checkInGoalAction, markSchoolWorkAction } from "../(auth)/goal-actions";

/**
 * The child's one tap (story 08-017): "I did it!" on a goal for today or a
 * piece of school work. A done one shows a tick and takes it back on a second
 * tap. The "+2 ⭐" that floats up is decoration; the label already says it.
 *
 * A goal's tick waits for a grown-up (the owner, 2026-10-20: "send this to
 * adult for verification before making done"): with `review`, the tap sends
 * it ("Waiting for a grown-up", which a second tap takes back), and only once
 * a guardian or Admin says yes does it show Done — then it is theirs to
 * change, not the child's.
 */
export function KidDoneButton({
  target,
  done,
  stars,
  labels,
  waiting = false,
  review,
}: {
  target: { kind: "goal"; householdId: string; goalId: string; childMemberId: string } | { kind: "school"; householdId: string; id: string };
  done: boolean;
  stars: number;
  labels: { doIt: string; done: string; undo: string; earned: string };
  /** Ticked and still waiting for a grown-up to verify it. */
  waiting?: boolean;
  /** Present when the tick must be verified: the words for while it waits. */
  review?: { waiting: string; sent: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(done || waiting);
  // Verified by a grown-up: the child sees it done and leaves it be.
  const settled = Boolean(review) && done;
  const pendingNow = Boolean(review) && optimistic && !done;
  const [burst, setBurst] = useState(0);
  // Confetti and balloons each time something is done (the owner, 2026-10-20).
  const [party, setParty] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !optimistic;
    setOptimistic(next);
    setError(null);
    if (next && !review) setBurst((count) => count + 1);
    if (next) setParty((count) => count + 1);
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
      <Celebration play={party} />
      <button
        type="button"
        onClick={settled ? undefined : toggle}
        disabled={pending || settled}
        aria-pressed={optimistic}
        aria-label={optimistic && !settled ? labels.undo : undefined}
        title={error ?? (optimistic && !settled ? labels.undo : undefined)}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-70",
          pendingNow
            ? // Waiting wraps within a narrow width, so the goal's own name keeps the room (rule 11).
              "max-w-[8.5rem] border-2 border-[var(--wh-attention)] bg-[var(--wh-attention-soft)] py-1.5 text-left leading-tight text-[var(--wh-foreground)]"
            : optimistic
            ? "wh-kid-pop bg-[var(--wh-handled)] text-white disabled:opacity-100"
            : "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] shadow-[0_6px_16px_-6px_var(--wh-primary-glow)] hover:bg-[var(--wh-primary-hover)]",
        )}
      >
        {pendingNow ? (
          <>
            <Hourglass aria-hidden className="size-4" /> {review!.waiting}
          </>
        ) : optimistic ? (
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
      {pendingNow && !waiting ? (
        <span role="status" className="sr-only">
          {review!.sent}
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
