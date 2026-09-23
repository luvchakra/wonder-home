"use client";

import { MapPin, Search } from "lucide-react";
import { useActionState, useId, useState, useTransition } from "react";

import type { WeatherPlace } from "@wonderhome/core/home/open-meteo";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import type { ActionState } from "../(auth)/actions";
import { removeWeatherAreaAction, searchWeatherPlacesAction, setWeatherAreaAction } from "../(auth)/weather-actions";

export type WeatherAreaProps = {
  householdId: string;
  /** The area in use, with what it last said, or none. */
  area: { label: string; checked: string | null; summary: string | null } | null;
};

const INPUT =
  "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";

/**
 * Where the household's weather comes from (story 17-007).
 *
 * An Admin types a town, picks one of the places found (never a free-typed
 * coordinate), and saves it. Changing it and switching weather off are right
 * here beside it (rule 12). What leaves the household is said in plain words
 * before anything is saved.
 */
export function WeatherArea({ householdId, area }: WeatherAreaProps) {
  const [searching, setSearching] = useState(area === null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [saveState, saveAction, saving] = useActionState<ActionState, FormData>(setWeatherAreaAction, {});
  const [offState, offAction, switchingOff] = useActionState<ActionState, FormData>(removeWeatherAreaAction, {});

  // Adjusted while rendering, when an action answers: a saved area closes
  // the search (the page re-renders with it in place), and switched off, the
  // only thing left to do is choose an area again.
  const [seen, setSeen] = useState({ saveState, offState });
  if (seen.saveState !== saveState || seen.offState !== offState) {
    setSeen({ saveState, offState });
    if (seen.saveState !== saveState && saveState.notice) setSearching(false);
    if (seen.offState !== offState && offState.notice) {
      setConfirmOff(false);
      setSearching(true);
    }
  }

  const notice = saveState.notice ?? offState.notice;
  const error = saveState.error ?? offState.error;

  return (
    <div className="space-y-4">
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {area ? (
        <div className="space-y-1">
          <p className="flex items-start gap-2 text-sm font-medium">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-primary)]" />
            <span className="break-words">{area.label}</span>
          </p>
          {area.summary ? <p className="text-sm text-[var(--wh-foreground-muted)]">{area.summary}</p> : null}
          {area.checked ? <p className="text-xs text-[var(--wh-foreground-subtle)]">Forecast checked {area.checked}</p> : null}
        </div>
      ) : null}

      <p className="text-xs text-[var(--wh-foreground-subtle)]">
        Only your area, rounded to about a kilometre, is sent to Open-Meteo for the forecast — never your address or anything about your family.
      </p>

      {searching ? (
        <AreaSearch householdId={householdId} onCancel={area ? () => setSearching(false) : undefined} saveAction={saveAction} saving={saving} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setSearching(true)}>
            Change area
          </Button>
          {confirmOff ? (
            <form action={offAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="householdId" value={householdId} />
              <span className="text-sm">Switch weather off?</span>
              <Button type="submit" variant="secondary" disabled={switchingOff}>
                {switchingOff ? "Switching off…" : "Yes, switch off"}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setConfirmOff(false)}>
                Keep it
              </Button>
            </form>
          ) : (
            <Button type="button" variant="quiet" onClick={() => setConfirmOff(true)}>
              Switch weather off
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function AreaSearch({
  householdId,
  onCancel,
  saveAction,
  saving,
}: {
  householdId: string;
  onCancel?: () => void;
  saveAction: (formData: FormData) => void;
  saving: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<WeatherPlace[] | null>(null);
  const [picked, setPicked] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [finding, startFinding] = useTransition();

  const find = () =>
    startFinding(async () => {
      setSearchError(null);
      const result = await searchWeatherPlacesAction(householdId, query);
      setPlaces(result.places ?? null);
      setPicked(0);
      setSearchError(result.error ?? null);
    });

  const choice = places?.[picked];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-query`} className="block text-sm font-medium">
          Your town or city
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-query`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                find();
              }
            }}
            autoComplete="address-level2"
            placeholder="e.g. Pune"
            className={`${INPUT} min-w-0 flex-1`}
          />
          <Button type="button" variant="secondary" onClick={find} disabled={finding || query.trim().length < 2} className="shrink-0">
            <Search aria-hidden className="size-4" />
            {finding ? "Finding…" : "Find"}
          </Button>
        </div>
      </div>

      {searchError ? <Alert tone="attention">{searchError}</Alert> : null}

      {places && places.length > 0 ? (
        <form action={saveAction} className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Which one is yours?</legend>
            {places.map((place, index) => (
              <label
                key={`${place.label}-${place.latitude}-${place.longitude}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-sm has-[:checked]:border-[var(--wh-primary)]"
              >
                <input type="radio" name="place" checked={picked === index} onChange={() => setPicked(index)} className="size-4 shrink-0 accent-[var(--wh-primary)]" />
                <span className="break-words">{place.label}</span>
              </label>
            ))}
          </fieldset>
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="label" value={choice?.label ?? ""} />
          <input type="hidden" name="latitude" value={choice?.latitude ?? ""} />
          <input type="hidden" name="longitude" value={choice?.longitude ?? ""} />
          <input type="hidden" name="timezone" value={choice?.timezone ?? ""} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !choice}>
              {saving ? "Saving…" : "Use this area"}
            </Button>
            {onCancel ? (
              <Button type="button" variant="quiet" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : onCancel ? (
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
