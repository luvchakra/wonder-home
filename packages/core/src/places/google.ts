import { z } from "zod";

import {
  metresBetween,
  PlacesUnavailableError,
  type LatLng,
  type NearbyQuery,
  type Place,
  type PlaceResult,
  type PlaceSearchInput,
  type PlaceSuggestion,
  type PlacesProvider,
} from "./provider";

/**
 * Google Places (New) behind the `PlacesProvider` port.
 *
 * - Autocomplete: `POST places:autocomplete`, biased to a circle around home;
 *   `origin` makes Google say how far each one is. A school search is never
 *   narrowed by `includedPrimaryTypes`: that keeps a place only when its
 *   *primary* type is one of the four school types, and Google files many
 *   schools under others ("ICSE school", "International school"), so
 *   "euro school thane" found nothing that Google Maps lists (2026-10-22).
 *   Instead every prediction's own `types` are read: schools come first,
 *   a bare city or road is dropped, any other place stays after them.
 * - Text search fallback: when autocomplete has nothing to offer, the same
 *   words go to `places:searchText`, the search behind the Maps search box,
 *   so what Maps finds for a name the picker finds too.
 * - Details: `GET places/{id}` with the narrowest field mask that gives a
 *   name, an address and a point. The session token from the search is
 *   passed through so typing and choosing are one billed session.
 * - Static map: one point with one marker, fetched by the server and served
 *   from our own origin, so the key and the CSP stay as they are.
 *
 * Every call has a timeout. A failure is a `PlacesUnavailableError`, which a
 * screen turns into "type it instead", never a dead search box.
 */

export const GOOGLE_PLACES_PROVIDER = "google";

const TIMEOUT_MS = 4_000;
/** How far "near home" reaches for a school: a long school run, not the next city. */
export const SCHOOL_RADIUS_METERS = 15_000;
/** Places (New) types that mark a place as a school, wherever they appear in its `types`. */
const SCHOOL_TYPES = new Set(["school", "primary_school", "secondary_school", "preschool", "educational_institution"]);
/**
 * Types that make a prediction a stretch of map rather than a place: a city,
 * a road, a postcode. A school search drops one carrying only these.
 */
const AREA_TYPES = new Set([
  "geocode",
  "political",
  "locality",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "neighborhood",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
  "postal_code",
  "route",
  "colloquial_area",
]);
/** How many places the text search fallback asks for. */
const FALLBACK_RESULTS = 8;
/** The text search fallback leans toward home this far, the most Google takes for a bias. */
const FALLBACK_BIAS_METERS = 50_000;

type Fetch = typeof fetch;

const autocompleteSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string().min(1),
            text: z.object({ text: z.string() }).optional(),
            structuredFormat: z
              .object({
                mainText: z.object({ text: z.string() }).optional(),
                secondaryText: z.object({ text: z.string() }).optional(),
              })
              .optional(),
            distanceMeters: z.number().optional(),
            types: z.array(z.string()).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

const fallbackSchema = z.object({
  places: z
    .array(
      z.object({
        id: z.string().min(1),
        displayName: z.object({ text: z.string() }).optional(),
        formattedAddress: z.string().optional(),
        location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
        types: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

/** The fallback asks only for what a suggestion shows. */
const FALLBACK_FIELDS = ["places.id", "places.displayName", "places.formattedAddress", "places.location", "places.types"].join(",");

type Found = PlaceSuggestion & { types: readonly string[] };

const isSchool = (types: readonly string[]) => types.some((type) => SCHOOL_TYPES.has(type));
const isOnlyArea = (types: readonly string[]) => types.length > 0 && types.every((type) => AREA_TYPES.has(type));

/** What a picker of this kind offers, in order: for a school, schools first and no bare areas; otherwise Google's order. */
function forKind(found: readonly Found[], kind: PlaceSearchInput["kind"]): PlaceSuggestion[] {
  const kept = kind === "school" ? found.filter((place) => !isOnlyArea(place.types)) : [...found];
  const ordered = kind === "school" ? [...kept.filter((place) => isSchool(place.types)), ...kept.filter((place) => !isSchool(place.types))] : kept;
  return ordered.map(({ types: _types, ...suggestion }) => suggestion);
}

const detailsSchema = z.object({
  id: z.string().min(1),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
});

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const dayTime = z.object({ day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23).optional(), minute: z.number().int().min(0).max(59).optional() });

const textSearchSchema = z.object({
  places: z
    .array(
      z.object({
        id: z.string().min(1),
        displayName: z.object({ text: z.string() }).optional(),
        formattedAddress: z.string().optional(),
        location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
        primaryTypeDisplayName: z.object({ text: z.string() }).optional(),
        rating: z.number().optional(),
        userRatingCount: z.number().optional(),
        priceLevel: z.string().optional(),
        currentOpeningHours: z.object({ openNow: z.boolean().optional() }).optional(),
        regularOpeningHours: z.object({ periods: z.array(z.object({ open: dayTime, close: dayTime.optional() })).optional() }).optional(),
        googleMapsUri: z.string().optional(),
      }),
    )
    .optional(),
});

/** What a text search asks Google for: enough to judge a place, nothing about the people who reviewed it. */
const TEXT_SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.currentOpeningHours.openNow",
  "places.regularOpeningHours.periods",
  "places.googleMapsUri",
].join(",");

export function createGooglePlacesProvider(options: { apiKey: string; fetch?: Fetch; timeoutMs?: number }): PlacesProvider {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  async function call(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new PlacesUnavailableError(timedOut ? "timeout" : "unavailable");
    }
    if (response.status === 401 || response.status === 403) throw new PlacesUnavailableError("refused");
    return response;
  }

  /**
   * The Maps search box's own search, for when autocomplete offered nothing:
   * forgiving of spacing and word order ("euro school" for "EuroSchool"),
   * leaning toward home, and saying how far each place is from it.
   */
  async function textSearch(input: PlaceSearchInput): Promise<Found[]> {
    const body: Record<string, unknown> = {
      textQuery: input.query,
      pageSize: FALLBACK_RESULTS,
    };
    if (input.languageCode) body.languageCode = input.languageCode;
    if (input.regionCode) body.regionCode = input.regionCode.toLowerCase();
    if (input.near)
      body.locationBias = {
        circle: { center: point(input.near), radius: FALLBACK_BIAS_METERS },
      };
    const response = await call("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": options.apiKey,
        "x-goog-fieldmask": FALLBACK_FIELDS,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new PlacesUnavailableError("unavailable");
    const parsed = fallbackSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new PlacesUnavailableError("unavailable");
    const found: Found[] = [];
    for (const place of parsed.data.places ?? []) {
      const name = place.displayName?.text ?? "";
      if (!name) continue;
      found.push({
        placeId: place.id,
        primary: name,
        secondary: place.formattedAddress ?? "",
        distanceMeters: input.near && place.location ? Math.round(metresBetween(input.near, place.location)) : null,
        types: place.types ?? [],
      });
    }
    return found;
  }

  return {
    name: GOOGLE_PLACES_PROVIDER,

    async search(input: PlaceSearchInput): Promise<PlaceSuggestion[]> {
      const body: Record<string, unknown> = { input: input.query, sessionToken: input.sessionToken };
      if (input.languageCode) body.languageCode = input.languageCode;
      if (input.regionCode) body.regionCode = input.regionCode.toLowerCase();
      if (input.near) {
        body.origin = point(input.near);
        body.locationBias = { circle: { center: point(input.near), radius: input.kind === "school" ? SCHOOL_RADIUS_METERS : 50_000 } };
      }
      const response = await call("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new PlacesUnavailableError("unavailable");
      const parsed = autocompleteSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new PlacesUnavailableError("unavailable");
      const found: Found[] = [];
      for (const suggestion of parsed.data.suggestions ?? []) {
        const prediction = suggestion.placePrediction;
        if (!prediction) continue;
        const primary = prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "";
        if (!primary) continue;
        found.push({
          placeId: prediction.placeId,
          primary,
          secondary: prediction.structuredFormat?.secondaryText?.text ?? "",
          distanceMeters: prediction.distanceMeters ?? null,
          types: prediction.types ?? [],
        });
      }
      const offered = forKind(found, input.kind);
      // A school search with no school in it, or any search with nothing at all, asks the text search too.
      const enough = input.kind === "school" ? found.some((place) => isSchool(place.types)) : offered.length > 0;
      if (enough) return offered;
      let more: Found[];
      try {
        more = await textSearch(input);
      } catch (error) {
        // Autocomplete's own answer still stands when the second look fails.
        if (offered.length > 0) return offered;
        throw error;
      }
      const seen = new Set<string>();
      const merged = [...more, ...found].filter((place) => !seen.has(place.placeId) && Boolean(seen.add(place.placeId)));
      return forKind(merged, input.kind);
    },

    async details(placeId, { sessionToken, languageCode }): Promise<Place | null> {
      const params = new URLSearchParams();
      if (sessionToken) params.set("sessionToken", sessionToken);
      if (languageCode) params.set("languageCode", languageCode);
      const query = params.size > 0 ? `?${params.toString()}` : "";
      const response = await call(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${query}`, {
        headers: { "x-goog-api-key": options.apiKey, "x-goog-fieldmask": "id,displayName,formattedAddress,location" },
      });
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) throw new PlacesUnavailableError("unavailable");
      const parsed = detailsSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success || !parsed.data.location || !parsed.data.formattedAddress) return null;
      return {
        placeId: parsed.data.id,
        name: parsed.data.displayName?.text ?? parsed.data.formattedAddress,
        formattedAddress: parsed.data.formattedAddress,
        latitude: parsed.data.location.latitude,
        longitude: parsed.data.location.longitude,
      };
    },

    async findNearby(query: NearbyQuery): Promise<PlaceResult[]> {
      const found = await nearby(query, true);
      // A strict type filter keeps only places Google filed under that type; when it leaves
      // nothing, the same search runs once with the type as a preference instead.
      if (found.length === 0 && query.includedType) return nearby(query, false);
      return found;
    },

    async staticMap(at: LatLng, { width, height, zoom }) {
      const where = `${at.latitude.toFixed(6)},${at.longitude.toFixed(6)}`;
      const params = new URLSearchParams({
        center: where,
        zoom: String(zoom),
        size: `${width}x${height}`,
        scale: "2",
        markers: `color:0x6366F1|${where}`,
        key: options.apiKey,
      });
      const response = await call(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`, {});
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.startsWith("image/")) return null;
      return { body: await response.arrayBuffer(), contentType };
    },
  };

  async function nearby(query: NearbyQuery, strict: boolean): Promise<PlaceResult[]> {
    const body: Record<string, unknown> = {
      textQuery: query.text,
      pageSize: Math.min(Math.max(query.max ?? 8, 1), 20),
      ...(query.within
        ? {
            locationRestriction: {
              rectangle: aroundBox(query.near, query.radiusMeters),
            },
          }
        : {
            locationBias: {
              circle: {
                center: point(query.near),
                radius: Math.min(query.radiusMeters, 50_000),
              },
            },
          }),
    };
    if (query.openNow) body.openNow = true;
    if (query.includedType) {
      body.includedType = query.includedType;
      if (strict) body.strictTypeFiltering = true;
    }
    if (query.languageCode) body.languageCode = query.languageCode;
    if (query.regionCode) body.regionCode = query.regionCode.toLowerCase();
    const response = await call("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": options.apiKey,
        "x-goog-fieldmask": TEXT_SEARCH_FIELDS,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new PlacesUnavailableError("unavailable");
    const parsed = textSearchSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new PlacesUnavailableError("unavailable");
    const found: PlaceResult[] = [];
    for (const place of parsed.data.places ?? []) {
      if (!place.location || !place.displayName?.text) continue;
      found.push({
        placeId: place.id,
        name: place.displayName.text,
        address: place.formattedAddress ?? "",
        location: place.location,
        kind: place.primaryTypeDisplayName?.text ?? null,
        rating: place.rating ?? null,
        ratingCount: place.userRatingCount ?? null,
        priceLevel: place.priceLevel && place.priceLevel in PRICE_LEVELS ? PRICE_LEVELS[place.priceLevel]! : null,
        openNow: place.currentOpeningHours?.openNow ?? null,
        periods: (place.regularOpeningHours?.periods ?? []).map((period) => ({
          open: {
            day: period.open.day,
            minute: (period.open.hour ?? 0) * 60 + (period.open.minute ?? 0),
          },
          close: period.close
            ? {
                day: period.close.day,
                minute: (period.close.hour ?? 0) * 60 + (period.close.minute ?? 0),
              }
            : null,
        })),
        mapsUri: place.googleMapsUri ?? null,
      });
    }
    return found;
  }
}

function point(at: LatLng) {
  return { latitude: at.latitude, longitude: at.longitude };
}

/**
 * The deployment's place search, or none. Off unless `GOOGLE_MAPS_API_KEY`
 * is set: without it every screen offers a plain address field instead.
 */
export function placesProviderFromEnv(env: Record<string, string | undefined> = process.env, fetchImpl?: Fetch): PlacesProvider | null {
  const apiKey = env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return null;
  return createGooglePlacesProvider({ apiKey, fetch: fetchImpl });
}

/** A box `radiusMeters` each way around a point: the place search's restriction takes a rectangle, not a circle. */
function aroundBox(
  near: LatLng,
  radiusMeters: number,
): {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
} {
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.max(Math.cos((near.latitude * Math.PI) / 180), 0.01));
  return {
    low: { latitude: Math.max(near.latitude - dLat, -90), longitude: Math.max(near.longitude - dLng, -180) },
    high: { latitude: Math.min(near.latitude + dLat, 90), longitude: Math.min(near.longitude + dLng, 180) },
  };
}
