"use client";

import { ExternalLink, NotebookPen, RotateCcw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { forgetPlaceAction, notePlaceAction } from "./actions";

export type PlaceBookLabels = {
  open: string;
  remove: string;
  bringBack: string;
  editNote: string;
  note: string;
  notePlaceholder: string;
  saveNote: string;
  saving: string;
  failed: string;
};

const ICON_BUTTON =
  "grid size-9 place-items-center rounded-full text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50";

const named = (template: string, name: string) => template.replace("{name}", name);

/**
 * A place-book row's actions, as icons with their own labels (rule 11): open
 * it in Google Maps, and — for an adult — keep a note on a saved place,
 * remove it, or let a turned-down place be suggested again.
 */
export function PlaceBookActions({
  householdId,
  place,
  canChange,
  labels,
}: {
  householdId: string;
  place: { id: string; name: string; mapsUri: string; status: "saved" | "not_for_us"; note: string | null };
  canChange: boolean;
  labels: PlaceBookLabels;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(place.note ?? "");

  const forget = () => {
    setError(null);
    startTransition(async () => {
      const result = await forgetPlaceAction({ householdId, id: place.id });
      if ("error" in result) setError(result.error || labels.failed);
    });
  };
  const saveNote = () => {
    setError(null);
    startTransition(async () => {
      const result = await notePlaceAction({ householdId, id: place.id, note });
      if ("error" in result) setError(result.error || labels.failed);
      else setNoteOpen(false);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {place.status === "saved" ? (
          <a href={place.mapsUri} target="_blank" rel="noopener noreferrer" aria-label={named(labels.open, place.name)} title={named(labels.open, place.name)} className={ICON_BUTTON}>
            <ExternalLink aria-hidden className="size-4" />
          </a>
        ) : null}
        {canChange && place.status === "saved" ? (
          <button type="button" onClick={() => setNoteOpen(true)} disabled={pending} aria-label={named(labels.editNote, place.name)} title={named(labels.editNote, place.name)} className={ICON_BUTTON}>
            <NotebookPen aria-hidden className="size-4" />
          </button>
        ) : null}
        {canChange ? (
          <button
            type="button"
            onClick={forget}
            disabled={pending}
            aria-label={named(place.status === "saved" ? labels.remove : labels.bringBack, place.name)}
            title={named(place.status === "saved" ? labels.remove : labels.bringBack, place.name)}
            className={ICON_BUTTON}
          >
            {place.status === "saved" ? <Trash2 aria-hidden className="size-4" /> : <RotateCcw aria-hidden className="size-4" />}
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-[var(--wh-risk)]">
          {error}
        </p>
      ) : null}
      <Sheet open={noteOpen} onOpenChange={setNoteOpen} title={named(labels.editNote, place.name)}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveNote();
          }}
        >
          <Field label={labels.note} name={`note-${place.id}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder={labels.notePlaceholder} maxLength={300} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.saving : labels.saveNote}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
