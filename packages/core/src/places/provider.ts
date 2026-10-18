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
/** What a picker searches for: the home address, a school near home, or an adult's office (any place, leaning toward home). */
/** "place": anything at all, for the place book (HomePlaces 24-006). */
export type PlaceSearchKind = "address" | "school" | "office" | "place";

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

/** A weekly opening window, as Google gives it: day 0 is Sunday, times in the place's own local time. */
export type OpeningPeriod = { open: { day: number; minute: number }; close: { day: number; minute: number } | null };

/** One place found near a point, with only what a household would weigh. */
export type PlaceResult = {
  placeId: string;
  name: string;
  address: string;
  location: LatLng;
  /** "Restaurant", "Park", "Ice cream shop": the provider's own words for what it is. */
  kind: string | null;
  rating: number | null;
  ratingCount: number | null;
  /** 0 (free) to 4 (very expensive), when the provider knows. */
  priceLevel: number | null;
  openNow: boolean | null;
  /** The weekly hours; empty when the provider does not know them. */
  periods: OpeningPeriod[];
  mapsUri: string | null;
};

export type NearbyQuery = {
  /** What to look for, in plain words: "family restaurant", "park playground". */
  text: string;
  near: LatLng;
  radiusMeters: number;
  /** Only places open right now. Opening at a later time is checked from `periods` instead. */
  openNow?: boolean;
  max?: number;
  languageCode?: string | null;
  regionCode?: string | null;
};

export type PlacesProvider = {
  readonly name: string;
  search(input: PlaceSearchInput): Promise<PlaceSuggestion[]>;
  details(placeId: string, options: { sessionToken?: string | null; languageCode?: string | null }): Promise<Place | null>;
  /** Places matching words near a point, best first. Absent on a provider that cannot search this way. */
  findNearby?(query: NearbyQuery): Promise<PlaceResult[]>;
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

const MINUTES_PER_WEEK = 7 * 24 * 60;

/** Minutes since Sunday 00:00. */
function weekMinute(day: number, minute: number): number {
  return (((day % 7) + 7) % 7) * 1440 + minute;
}

/**
 * Whether a place is open for the whole of a window, from its weekly hours:
 * `day` 0 is Sunday, `fromMinute` minutes after midnight, for `forMinutes`.
 * Null when its hours are not known: unknown is never reported as open.
 * A period with no close is open around the clock.
 */
export function isOpenFor(periods: readonly OpeningPeriod[], day: number, fromMinute: number, forMinutes: number): boolean | null {
  if (periods.length === 0) return null;
  const start = weekMinute(day, fromMinute);
  const end = start + forMinutes;
  for (const period of periods) {
    if (!period.close) return true;
    const open = weekMinute(period.open.day, period.open.minute);
    let close = weekMinute(period.close.day, period.close.minute);
    if (close <= open) close += MINUTES_PER_WEEK;
    // The window may sit in this week's copy of the period or, across the week's end, the next.
    for (const shift of [0, MINUTES_PER_WEEK]) {
      if (start + shift >= open && end + shift <= close) return true;
    }
  }
  return false;
}

/** Straight-line distance in metres between two points (haversine). */
export function metresBetween(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
