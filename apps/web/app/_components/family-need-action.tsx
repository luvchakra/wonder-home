"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { Pill } from "@wonderhome/core/ui/pill";

import type { ActionState } from "../(auth)/actions";
import { advanceGiftAction, resolveConflictAction, settleEventAction } from "../(auth)/family-actions";

/**
 * The action on a Family "needs a reply" row, as something that actually
 * happens when tapped. These pills used to link back to the page they were
 * on. Now each records the thing the household did — replied, bought the
 * gift, sorted the clash — so the row stops asking.
 */

function Submit({ label, tone }: { label: string; tone: "primary" | "soft" | "quiet" }) {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone={tone} disabled={pending}>
      {pending ? "…" : label}
    </Pill>
  );
}

/** The pills' words; the page passes them in the viewer's language (story 22-004). */
export type FamilyNeedLabels = {
  replied: string;
  giftSorted: string;
  prepared: string;
  travelSorted: string;
  done: string;
  chosen: string;
  ordered: string;
  given: string;
  sorted: string;
  fineAsIs: string;
};

export const FAMILY_NEED_LABELS: FamilyNeedLabels = {
  replied: "Replied",
  giftSorted: "Gift sorted",
  prepared: "Prepared",
  travelSorted: "Travel sorted",
  done: "Done",
  chosen: "Chosen",
  ordered: "Ordered",
  given: "Given",
  sorted: "Sorted",
  fineAsIs: "Fine as is",
};

const EVENT_DONE: Record<string, keyof FamilyNeedLabels> = {
  needs_rsvp: "replied",
  needs_gift: "giftSorted",
  needs_preparation: "prepared",
  needs_travel: "travelSorted",
};

const GIFT_STEP: Record<string, { step: "chosen" | "ordered" | "given"; label: keyof FamilyNeedLabels }> = {
  choose_gift: { step: "chosen", label: "chosen" },
  order_gift: { step: "ordered", label: "ordered" },
  sort_gift: { step: "given", label: "given" },
};

export function FamilyNeedAction({
  householdId,
  item,
  labels = FAMILY_NEED_LABELS,
}: {
  householdId: string;
  item: HomeAssessment;
  labels?: FamilyNeedLabels;
}) {
  const domain = item.subjectKey.split(".")[0];
  const target = item.action?.target;
  const kind = item.action?.action;
  const tone = item.riskLevel === "high" ? "primary" : "soft";

  const [eventState, settle] = useActionState<ActionState, FormData>(settleEventAction, {});
  const [giftState, advance] = useActionState<ActionState, FormData>(advanceGiftAction, {});
  const [conflictState, resolve] = useActionState<ActionState, FormData>(resolveConflictAction, {});

  if (!target || !kind) return null;

  if (domain === "event") {
    return (
      <form action={settle} className="flex flex-col items-end gap-1">
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="eventId" value={target} />
        <Submit label={labels[EVENT_DONE[kind] ?? "done"]} tone={tone} />
        {eventState.error ? <span className="text-[0.6875rem] text-[var(--wh-risk)]">{eventState.error}</span> : null}
      </form>
    );
  }

  if (domain === "gift") {
    const step = GIFT_STEP[kind] ?? GIFT_STEP.sort_gift!;
    return (
      <form action={advance} className="flex flex-col items-end gap-1">
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="giftId" value={target} />
        <input type="hidden" name="step" value={step.step} />
        <Submit label={labels[step.label]} tone={tone} />
        {giftState.error ? <span className="text-[0.6875rem] text-[var(--wh-risk)]">{giftState.error}</span> : null}
      </form>
    );
  }

  if (domain === "conflict") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-1.5">
          <form action={resolve}>
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="conflictId" value={target} />
            <input type="hidden" name="outcome" value="resolved" />
            <Submit label={labels.sorted} tone="primary" />
          </form>
          <form action={resolve}>
            <input type="hidden" name="householdId" value={householdId} />
            <input type="hidden" name="conflictId" value={target} />
            <input type="hidden" name="outcome" value="declined" />
            <Submit label={labels.fineAsIs} tone="quiet" />
          </form>
        </div>
        {conflictState.error ? <span className="text-[0.6875rem] text-[var(--wh-risk)]">{conflictState.error}</span> : null}
      </div>
    );
  }

  return null;
}

/** The "Gift" pill on an upcoming event, as the same settle action. */
export function SettleEventPill({ householdId, eventId, label }: { householdId: string; eventId: string; label: string }) {
  const [state, settle] = useActionState<ActionState, FormData>(settleEventAction, {});
  return (
    <form action={settle} className="flex flex-col items-end gap-1">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="eventId" value={eventId} />
      <Submit label={label} tone="soft" />
      {state.error ? <span className="text-[0.6875rem] text-[var(--wh-risk)]">{state.error}</span> : null}
    </form>
  );
}
