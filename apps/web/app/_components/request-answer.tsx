"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@wonderhome/core/ui/button";
import { Pill } from "@wonderhome/core/ui/pill";

import { answerRequestAction } from "../(auth)/approval-actions";

/**
 * Approve or Decline on a child's or helper's request. Nothing they asked
 * for is written until an adult approves here.
 */
export function RequestAnswer({ householdId, approvalId, labels }: { householdId: string; approvalId: string; labels: { approve: string; decline: string; working: string } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const answer = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const result = await answerRequestAction({ householdId, approvalId, decision });
      setSaid(result.ok ? { ok: true, text: result.text } : { ok: false, text: result.reason });
      router.refresh();
    });

  if (said) {
    return (
      <p role="status" className={said.ok ? "text-sm text-[var(--wh-handled)]" : "text-sm text-[var(--wh-attention)]"}>
        {said.text}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => answer("approved")} disabled={pending}>
        <Check aria-hidden className="size-4" /> {pending ? labels.working : labels.approve}
      </Button>
      <Pill type="button" tone="quiet" onClick={() => answer("rejected")} disabled={pending}>
        <X aria-hidden className="size-4" /> {labels.decline}
      </Pill>
    </div>
  );
}
