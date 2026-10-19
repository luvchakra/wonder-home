import type { Place } from "./provider";

/**
 * An event's place (the owner, 2026-10-19): picked from Google Maps, or typed.
 *
 * - **Picked.** Only the place's id comes from the browser. The caller reads
 *   the place again from the provider (`pickedPlace`) and its name and
 *   address are what is kept, with the id, so the event opens in Google Maps.
 * - **The same place again.** An edit that keeps the event's place costs no
 *   lookup: what is on record stands.
 * - **Typed.** "Home", "Nani's house": kept as written, with no address and
 *   no id. Also what happens when a picked place cannot be read right now, so
 *   a saved event never loses its "where" to a provider outage.
 */
export type EventPlace = { location: string | null; locationPlaceId: string | null; locationAddress: string | null };

export const NO_PLACE: EventPlace = { location: null, locationPlaceId: null, locationAddress: null };

/** What the form posted: the place's id when one was picked, and the text in the box. */
export type PostedEventPlace = { placeId: string | null; typed: string | null };

/** Whether the provider needs asking: a place was picked, and it is not the one already on record. */
export function needsLookup(posted: PostedEventPlace, current: EventPlace | null): boolean {
  return Boolean(posted.placeId) && posted.placeId !== current?.locationPlaceId;
}

/** The place to save, from what was posted, what is on record, and the provider's answer for a new pick. */
export function decideEventPlace(posted: PostedEventPlace, current: EventPlace | null, picked: Place | null): EventPlace {
  const typed = posted.typed?.trim().slice(0, 200) || null;
  if (posted.placeId) {
    if (current && posted.placeId === current.locationPlaceId) return current;
    if (picked && picked.placeId === posted.placeId) {
      return {
        location: picked.name.trim().slice(0, 200) || typed,
        locationPlaceId: picked.placeId,
        locationAddress: picked.formattedAddress.trim().slice(0, 300) || null,
      };
    }
  }
  return typed ? { location: typed, locationPlaceId: null, locationAddress: null } : NO_PLACE;
}

/**
 * The link Google Maps' own share button gives for a picked place; needs no
 * key. Null for a typed place: "Home" searched on Google Maps would find
 * somebody else's.
 */
export function mapsLinkFor(place: { location: string | null; locationAddress?: string | null; locationPlaceId?: string | null }): string | null {
  if (!place.locationPlaceId) return null;
  const query = [place.location, place.locationAddress].filter(Boolean).join(", ");
  if (!query) return null;
  const params = new URLSearchParams({ api: "1", query, query_place_id: place.locationPlaceId });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
