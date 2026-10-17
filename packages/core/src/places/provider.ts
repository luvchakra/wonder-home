/**
 * Place search: a home address, a school near home.
 *
 * One provider-neutral port, so a screen never knows which map service is
 * behind it. Google Places (`google.ts`) is the only adapter, and it is live
 * only when the deployment sets `GOOGLE_MAPS_API_KEY`. The key stays on the
 * server: the browser asks our own server action, never Google directly, so
 * the key is never in a page and every search is rate limited per member.
 *
 * A picked place is always re-read on the server by its id (`details`)
 * before anything is saved. The browser sends only which suggestion was
 * chosen, never an address or coordinates of its own.
 */

/** What a search is for. A school search is limited to schools and leans toward home. */
export type PlaceSearchKind = "address" | "school";

export type PlaceSuggestion = {
  placeId: string;
  /** The name or first line, e.g. "Delhi Public School" or "12 MG Road". */
  primary: string;
  /** The rest, e.g. "Sector 45, Gurugram, Haryana". Empty when there is none. */
  secondary: string;
  /** Straight-line distance from home in metres, when home is known. */
  distanceMeters: number | null;
};

export type Place = {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

export type LatLng = { latitude: number; longitude: number };

export type PlaceSearchInput = {
  query: string;
  kind: PlaceSearchKind;
  /** One per search, from typing to choosing, so the provider bills it as one session. */
  sessionToken: string;
  /** The household's home, when known: results lean toward it and say how far away they are. */
  near?: LatLng | null;
  /** ISO 3166-1 alpha-2, e.g. "IN": results lean toward the household's country. */
  regionCode?: string | null;
  languageCode?: string | null;
};

export type PlacesProvider = {
  readonly name: string;
  search(input: PlaceSearchInput): Promise<PlaceSuggestion[]>;
  details(placeId: string, options: { sessionToken?: string | null; languageCode?: string | null }): Promise<Place | null>;
  /** A small map of one point, as an image the server passes through. Null when the provider has none. */
  staticMap?(point: LatLng, options: { width: number; height: number; zoom: number }): Promise<{ body: ArrayBuffer; contentType: string } | null>;
};

export class PlacesUnavailableError extends Error {
  constructor(readonly reason: "timeout" | "unavailable" | "refused") {
    super(`place search ${reason}`);
    this.name = "PlacesUnavailableError";
  }
}

/** A link that opens the place in Google Maps. Needs no key; it is an ordinary link a person follows. */
export function mapsLink(place: { name?: string | null; formattedAddress: string; placeId?: string | null }): string {
  const query = [place.name, place.formattedAddress].filter(Boolean).join(", ");
  const params = new URLSearchParams({ api: "1", query });
  if (place.placeId) params.set("query_place_id", place.placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/** "450 m", "2.3 km", "18 km": distance as a person reads it. */
export function distanceLabel(meters: number | null): string | null {
  if (meters === null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}
