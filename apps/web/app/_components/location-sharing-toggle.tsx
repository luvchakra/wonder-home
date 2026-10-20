"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import type { ActionState } from "../(auth)/actions";
import { setLocationSharingAction } from "../(auth)/location-actions";

export type LocationToggleLabels = { turnOn: string; turnOff: string; turnedOn: string; turnedOff: string };

function Submit({ label, on }: { label: string; on: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={on ? "secondary" : "primary"} disabled={pending}>
      {label}
    </Button>
  );
}

/**
 * Turns one member's location sharing on or off: an adult's own in Settings,
 * a child's by their guardian or an Admin in Family. The server's policy is
 * what decides who may; this only asks.
 */
export function LocationSharingToggle({ householdId, memberId, enabled, labels }: { householdId: string; memberId: string; enabled: boolean; labels: LocationToggleLabels }) {
  const [state, action] = useActionState<ActionState, FormData>(setLocationSharingAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="enabled" value={enabled ? "off" : "on"} />
      <Submit label={enabled ? labels.turnOff : labels.turnOn} on={enabled} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <p role="status" className="text-xs text-[var(--wh-foreground-muted)]">{state.notice === "on" ? labels.turnedOn : labels.turnedOff}</p> : null}
    </form>
  );
}
