"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";

import { PlaceSearchField, type PlaceSearchLabels } from "../_components/place-search-field";
import { addPlaceAction, type AddPlaceState } from "./actions";

export type AddPlaceLabels = {
  label: string;
  note: string;
  save: string;
  saving: string;
  saved: string;
  pick: string;
  failed: string;
  busy: string;
  search: PlaceSearchLabels;
};

/**
 * Find a place and keep it in the book, without asking HomeTalk (24-006).
 * A place is picked from the search list, never typed: the book holds real
 * places HomeTalk can rank and open in Maps.
 */
export function AddPlaceForm({ householdId, labels }: { householdId: string; labels: AddPlaceLabels }) {
  const [state, formAction, pending] = useActionState<AddPlaceState, FormData>(addPlaceAction, {});
  // A fresh field after each save, so the next search starts empty; a refusal keeps what was picked.
  const round = state.savedAt ?? 0;
  const message = state.result === "saved" ? labels.saved : state.result === "pick" ? labels.pick : state.result === "busy" ? labels.busy : state.result === "failed" ? labels.failed : null;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="householdId" value={householdId} />
      <PlaceSearchField
        key={round}
        householdId={householdId}
        kind="place"
        label={labels.label}
        textName="place_name"
        placeName="place_id"
        sessionName="place_session"
        initial={null}
        available
        labels={labels.search}
      />
      <Field key={`note-${round}`} label={labels.note} name="note" maxLength={300} autoComplete="off" />
      {message ? (
        state.result === "saved" ? (
          <p role="status" className="text-sm text-[var(--wh-handled)]">
            {message}
          </p>
        ) : (
          <Alert>{message}</Alert>
        )
      ) : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? labels.saving : labels.save}
      </Button>
    </form>
  );
}
