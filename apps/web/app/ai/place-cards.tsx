"use client";

import { Bookmark, BookmarkCheck, ExternalLink, MapPin, ThumbsDown, Trees, UtensilsCrossed } from "lucide-react";
import { useState, useTransition } from "react";

import type { PlaceSuggestion } from "@wonderhome/core/homeplaces/service";
import { distanceLabel, mapsLink } from "@wonderhome/core/places/provider";
import { ActionRow } from "@wonderhome/core/ui/action-row";

import { setPlaceAction } from "./place-actions";

export type PlaceCardLabels = {
  heading: string;
  open: string;
  save: string;
  saved: string;
  unsave: string;
  notForUs: string;
  hidden: string;
  undo: string;
  failed: string;
};

export type PlaceMark = "saved" | "not_for_us" | null;

/**
 * The places a HomePlaces answer offered, as rows: what it is, how far and
 * how well rated, then three small actions — open it in Google Maps, save it
 * (it comes first next time), or "not for us" (it never comes back). Saving
 * is the household's own teaching; nothing else is learned.
 */
export function PlaceCards({
  householdId,
  messageId,
  places,
  marks,
  labels,
}: {
  householdId: string;
  messageId: string;
  places: readonly PlaceSuggestion[];
  /** What the household already said about these places, by place id. */
  marks: Readonly<Record<string, PlaceMark>>;
  labels: PlaceCardLabels;
}) {
  const [state, setState] = useState<Record<string, PlaceMark>>(() =>
    Object.fromEntries(places.map((place) => [place.placeId, marks[place.placeId] ?? (place.saved ? "saved" : null)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (placeId: string, next: PlaceMark) => {
    const before = state[placeId] ?? null;
    setState((current) => ({ ...current, [placeId]: next }));
    setError(null);
    startTransition(async () => {
      const result = await setPlaceAction({ householdId, messageId, placeId, status: next ?? "clear" });
      if ("error" in result) {
        setState((current) => ({ ...current, [placeId]: before }));
        setError(result.error || labels.failed);
      }
    });
  };
  const named = (template: string, name: string) => template.replace("{name}", name);

  return (
    <div className="rounded-[var(--wh-radius)] bg-[var(--wh-surface)] px-3 shadow-[var(--wh-shadow-card)]">
      <h3 className="sr-only">{labels.heading}</h3>
      <ul className="divide-y divide-[var(--wh-border)]">
        {places.map((place) => {
          const mark = state[place.placeId] ?? null;
          if (mark === "not_for_us") {
            return (
              <li key={place.placeId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs text-[var(--wh-foreground-subtle)]">
                <span>{named(labels.hidden, place.name)}</span>
                <button
                  type="button"
                  onClick={() => set(place.placeId, null)}
                  disabled={pending}
                  className="min-h-9 rounded-full px-3 font-semibold text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)] disabled:opacity-50"
                >
                  {labels.undo}
                </button>
              </li>
            );
          }
          const food = /restaurant|cafe|café|coffee|food|bakery|dessert|ice cream|pizza|diner|bar|eatery|kitchen/i.test(place.kind ?? "");
          const outdoors = /park|garden|playground|play area|zoo/i.test(place.kind ?? "");
          const meta = [place.kind, distanceLabel(place.distanceMeters), place.rating !== null ? `★${place.rating.toFixed(1)}` : null, mark === "saved" ? labels.saved : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <ActionRow
              key={place.placeId}
              icon={food ? UtensilsCrossed : outdoors ? Trees : MapPin}
              tone={food ? "meals" : outdoors ? "handled" : "people"}
              title={place.name}
              meta={meta}
              action={
                <div className="flex items-center gap-1">
                  <a
                    href={place.mapsUri ?? mapsLink({ name: place.name, formattedAddress: place.address, placeId: place.placeId })}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={named(labels.open, place.name)}
                    title={named(labels.open, place.name)}
                    className={ICON_BUTTON}
                  >
                    <ExternalLink aria-hidden className="size-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => set(place.placeId, mark === "saved" ? null : "saved")}
                    disabled={pending}
                    aria-pressed={mark === "saved"}
                    aria-label={named(mark === "saved" ? labels.unsave : labels.save, place.name)}
                    title={named(mark === "saved" ? labels.unsave : labels.save, place.name)}
                    className={ICON_BUTTON + (mark === "saved" ? " text-[var(--wh-primary)]" : "")}
                  >
                    {mark === "saved" ? <BookmarkCheck aria-hidden className="size-4" /> : <Bookmark aria-hidden className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => set(place.placeId, "not_for_us")}
                    disabled={pending}
                    aria-label={named(labels.notForUs, place.name)}
                    title={named(labels.notForUs, place.name)}
                    className={ICON_BUTTON}
                  >
                    <ThumbsDown aria-hidden className="size-4" />
                  </button>
                </div>
              }
            />
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="pb-3 text-xs text-[var(--wh-risk)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const ICON_BUTTON =
  "grid size-9 place-items-center rounded-full text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-50";
