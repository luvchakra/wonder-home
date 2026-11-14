"use client";

import { useActionState } from "react";

import { Button } from "@wonderhome/core/ui/button";
import { answerNeedsYouAction, type NeedsYouState } from "../(auth)/needs-you-actions";

/**
 * The tap answers of one "Needs you" question — the only part of the list that
 * runs in the browser (the rows themselves are drawn on the server, so the
 * list adds next to nothing to a page's JavaScript). The first answer is the
 * committing one (blue, rule 3); once answered, the buttons give way to the
 * outcome in words.
 */
export function NeedsYouAnswers({
  householdId,
  id,
  answers,
  labels,
}: {
  householdId: string;
  id: string;
  answers: { value: string; label: string }[];
  labels: { done: string; settled: string; failed: string };
}) {
  const [state, action, pending] = useActionState<NeedsYouState, FormData>(answerNeedsYouAction, {});
  if (state.result === "done" || state.result === "settled") {
    return (
      <p className="mt-2 text-sm text-[var(--wh-handled)]" role="status">
        {state.result === "done" ? labels.done : labels.settled}
      </p>
    );
  }
  return (
    <>
      <form action={action} className="mt-2 flex flex-wrap gap-2">
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="id" value={id} />
        {answers.map((answer, index) => (
          <Button key={answer.value} type="submit" name="answer" value={answer.value} variant={index === 0 ? "primary" : "secondary"} disabled={pending}>
            {answer.label}
          </Button>
        ))}
      </form>
      {state.result === "failed" ? (
        <p className="mt-2 text-sm text-[var(--wh-attention)]" role="alert">
          {labels.failed}
        </p>
      ) : null}
    </>
  );
}
