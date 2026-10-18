"use client";

import { SlidersHorizontal } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../../(auth)/actions";
import { saveCalendarPreferencesAction } from "../../(auth)/calendar-actions";

export type CalendarFiltersLabels = {
  button: string;
  title: string;
  description: string;
  categories: string;
  people: string;
  peopleHint: string;
  onlyMine: string;
  confirmedOnly: string;
  holidays: string;
  openOn: string;
  save: string;
  saving: string;
  failed: string;
};

/**
 * What one person's calendar shows (story 12-009, design §4 "Filters"):
 * categories, people, only mine, confirmed only, the holiday list and the
 * view it opens on. Saved to their own `calendar_preferences`; it narrows
 * what they see and never what anyone else sees.
 */
export function CalendarFilters({
  householdId,
  labels,
  categories,
  shown,
  members,
  memberIds,
  onlyMine,
  confirmedOnly,
  holidayOptions,
  holidayRegion,
  views,
  defaultView,
}: {
  householdId: string;
  labels: CalendarFiltersLabels;
  categories: { value: string; label: string }[];
  shown: string[];
  members: { value: string; label: string }[];
  memberIds: string[];
  onlyMine: boolean;
  confirmedOnly: boolean;
  holidayOptions: { value: string; label: string }[];
  holidayRegion: string;
  views: { value: string; label: string }[];
  defaultView: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveCalendarPreferencesAction, {});
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal aria-hidden className="size-3.5" /> {labels.button}
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title={labels.title} description={labels.description}>
        <form action={formAction} className="space-y-5">
          {state.error ? <Alert>{labels.failed}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <ChoiceChips legend={labels.categories} name="shown" type="checkbox" options={categories} defaultValue={shown} />
          {members.length > 1 ? (
            <div className="space-y-1">
              <ChoiceChips legend={labels.people} name="memberIds" type="checkbox" options={members} defaultValue={memberIds} />
              <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.peopleHint}</p>
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="onlyMine" defaultChecked={onlyMine} className="size-4 accent-[var(--wh-primary)]" />
              {labels.onlyMine}
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="confirmedOnly" defaultChecked={confirmedOnly} className="size-4 accent-[var(--wh-primary)]" />
              {labels.confirmedOnly}
            </label>
          </div>
          <Select label={labels.holidays} name="holidayRegion" defaultValue={holidayRegion}>
            {holidayOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <ChoiceChips legend={labels.openOn} name="defaultView" options={views} defaultValue={defaultView} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.saving : labels.save}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
