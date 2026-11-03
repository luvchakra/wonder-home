"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Pill } from "@wonderhome/core/ui/pill";

import type { ActionState } from "../(auth)/actions";
import { removeHomeAddressAction, setHomeAddressAction } from "../(auth)/places-actions";
import { SubmitButton } from "./submit-pill";
import { PlaceSearchField, type PlaceSearchLabels, type PlaceSearchValue } from "./place-search-field";

/**
 * Manage Household → Home address: set it, change it, remove it (rule 12),
 * through the same write path setup uses (rule 23).
 */
export function HomeAddressEditor({
  householdId,
  initial,
  unitLine,
  available,
  labels,
}: {
  householdId: string;
  initial: PlaceSearchValue | null;
  unitLine: string;
  available: boolean;
  labels: { unit: string; unitHint: string; field: string; save: string; saving: string; remove: string; removing: string; search: PlaceSearchLabels };
}) {
  const [saved, save] = useActionState<ActionState, FormData>(setHomeAddressAction, {});
  const [removed, remove, removing] = useActionState<ActionState, FormData>(removeHomeAddressAction, {});
  const state = removed.error || removed.notice ? removed : saved;
  return (
    <div className="space-y-3">
      {state.error ? <Alert tone="risk">{state.error}</Alert> : state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <form action={save} className="space-y-3">
        <input type="hidden" name="householdId" value={householdId} />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-[var(--wh-ink)]">{labels.unit}</span>
          <input
            type="text"
            name="home_unit_line"
            defaultValue={unitLine}
            maxLength={120}
            autoComplete="off"
            placeholder={labels.unitHint}
            className="min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
          />
        </label>
        <PlaceSearchField
          key={initial?.text ?? "none"}
          householdId={householdId}
          kind="address"
          label={labels.field}
          textName="home_address"
          placeName="home_place_id"
          sessionName="places_session"
          initial={initial}
          available={available}
          labels={labels.search}
        />
        <SubmitButton className="w-full" pendingLabel={labels.saving}>
          {labels.save}
        </SubmitButton>
      </form>
      {initial ? (
        <form action={remove}>
          <input type="hidden" name="householdId" value={householdId} />
          <Pill type="submit" tone="quiet" disabled={removing} className="text-[var(--wh-risk)]">
            {removing ? labels.removing : labels.remove}
          </Pill>
        </form>
      ) : null}
    </div>
  );
}
