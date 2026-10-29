"use client";

import { useState, useTransition } from "react";

import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";

import { setLocationAudienceAction } from "../(auth)/location-actions";

export type LocationAudienceLabels = { legend: string; adultsOnly: string; alsoChildren: string; saved: string };

/**
 * When sharing is on, the sharer picks who may see it: the family's adults
 * only (the default) or the children too (the owner, 2026-10-29). A picked
 * choice, never typed (rule 20), that saves the moment it is made. The
 * server's policy is what decides who may; this only asks.
 */
export function LocationAudienceChoice({
  householdId,
  memberId,
  visibleToChildren,
  labels,
}: {
  householdId: string;
  memberId: string;
  visibleToChildren: boolean;
  labels: LocationAudienceLabels;
}) {
  const [choice, setChoice] = useState<"adults" | "children">(visibleToChildren ? "children" : "adults");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-1.5">
      <ChoiceChips
        legend={labels.legend}
        name="locationAudience"
        size="sm"
        value={choice}
        onValueChange={(value) => {
          const next = value === "children" ? "children" : "adults";
          const previous = choice;
          setChoice(next);
          setStatus(null);
          startTransition(async () => {
            const result = await setLocationAudienceAction({ householdId, memberId, visibleToChildren: next === "children" });
            if (result.error) {
              setChoice(previous);
              setStatus(result.error);
            } else {
              setStatus(labels.saved);
            }
          });
        }}
        options={[
          { value: "adults", label: labels.adultsOnly },
          { value: "children", label: labels.alsoChildren },
        ]}
        disabled={pending}
      />
      {status ? (
        <p role="status" className="text-xs text-[var(--wh-foreground-muted)]">
          {status}
        </p>
      ) : null}
    </div>
  );
}
