import { describe, expect, it } from "vitest";

import { createGooglePlacesProvider, placesProviderFromEnv, SCHOOL_RADIUS_METERS } from "./google";
import { distanceLabel, isOpenFor, mapsLink, metresBetween, PlacesUnavailableError } from "./provider";

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return respond(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Google Places adapter", () => {
  it("is off without a key, so a screen offers a plain field instead", () => {
    expect(placesProviderFromEnv({})).toBeNull();
    expect(placesProviderFromEnv({ GOOGLE_MAPS_API_KEY: "  " })).toBeNull();
    expect(placesProviderFromEnv({ GOOGLE_MAPS_API_KEY: "k" })?.name).toBe("google");
  });

  it("searches schools only, leaning toward home, and says how far each is", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({
        suggestions: [
          { placePrediction: { placeId: "abc", structuredFormat: { mainText: { text: "Greenwood High" }, secondaryText: { text: "Sarjapur Road, Bengaluru" } }, distanceMeters: 2300 } },
          { queryPrediction: { text: { text: "greenwood" } } },
        ],
      }),
    );
    const provider = createGooglePlacesProvider({ apiKey: "key", fetch });
    const found = await provider.search({ query: "green", kind: "school", sessionToken: "s", near: { latitude: 12.9, longitude: 77.6 }, regionCode: "IN", languageCode: "en" });

    expect(found).toEqual([{ placeId: "abc", primary: "Greenwood High", secondary: "Sarjapur Road, Bengaluru", distanceMeters: 2300 }]);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.includedPrimaryTypes).toContain("school");
    expect(body.locationBias.circle).toEqual({ center: { latitude: 12.9, longitude: 77.6 }, radius: SCHOOL_RADIUS_METERS });
    expect(body.origin).toEqual({ latitude: 12.9, longitude: 77.6 });
    expect(body.regionCode).toBe("in");
    expect((calls[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("key");
  });

  it("an address search is not limited to a kind of place", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    await createGooglePlacesProvider({ apiKey: "key", fetch }).search({ query: "12 MG Road", kind: "address", sessionToken: "s" });
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.includedPrimaryTypes).toBeUndefined();
    expect(body.locationBias).toBeUndefined();
  });

  it("re-reads a picked place by id with a narrow field mask and the same session", async () => {
    const { fetch, calls } = fakeFetch(() => json({ id: "abc", displayName: { text: "Greenwood High" }, formattedAddress: "Sarjapur Road, Bengaluru", location: { latitude: 12.91, longitude: 77.68 } }));
    const place = await createGooglePlacesProvider({ apiKey: "key", fetch }).details("abc", { sessionToken: "s-1", languageCode: "hi" });
    expect(place).toEqual({ placeId: "abc", name: "Greenwood High", formattedAddress: "Sarjapur Road, Bengaluru", latitude: 12.91, longitude: 77.68 });
    expect(calls[0]!.url).toBe("https://places.googleapis.com/v1/places/abc?sessionToken=s-1&languageCode=hi");
    expect((calls[0]!.init.headers as Record<string, string>)["x-goog-fieldmask"]).toBe("id,displayName,formattedAddress,location");
  });

  it("a place that does not exist, or has no point, is nothing to save", async () => {
    const missing = fakeFetch(() => json({ error: {} }, 404));
    expect(await createGooglePlacesProvider({ apiKey: "key", fetch: missing.fetch }).details("gone", {})).toBeNull();
    const pointless = fakeFetch(() => json({ id: "x", formattedAddress: "Somewhere" }));
    expect(await createGooglePlacesProvider({ apiKey: "key", fetch: pointless.fetch }).details("x", {})).toBeNull();
  });

  it("a refused key or an outage is a PlacesUnavailableError, never a crash", async () => {
    const refused = fakeFetch(() => json({}, 403));
    await expect(createGooglePlacesProvider({ apiKey: "key", fetch: refused.fetch }).search({ query: "ab", kind: "address", sessionToken: "s" })).rejects.toBeInstanceOf(PlacesUnavailableError);
    const down = { fetch: (async () => { throw new TypeError("network"); }) as typeof globalThis.fetch };
    await expect(createGooglePlacesProvider({ apiKey: "key", fetch: down.fetch }).details("x", {})).rejects.toMatchObject({ reason: "unavailable" });
  });
});

describe("place helpers", () => {
  it("says distance the way a person reads it", () => {
    expect(distanceLabel(null)).toBeNull();
    expect(distanceLabel(20)).toBe("50 m");
    expect(distanceLabel(430)).toBe("450 m");
    expect(distanceLabel(2340)).toBe("2.3 km");
    expect(distanceLabel(18_400)).toBe("18 km");
  });

  it("links to Google Maps by name and place id, with no key", () => {
    const link = mapsLink({ name: "Greenwood High", formattedAddress: "Sarjapur Road", placeId: "abc" });
    expect(link).toBe("https://www.google.com/maps/search/?api=1&query=Greenwood+High%2C+Sarjapur+Road&query_place_id=abc");
    expect(link).not.toContain("key=");
  });
});

describe("finding places near a point", () => {
  it("asks for only what a household weighs, near the point, and reads hours and price", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({
        places: [
          {
            id: "p1",
            displayName: { text: "Cubbon Park" },
            formattedAddress: "Kasturba Road, Bengaluru",
            location: { latitude: 12.97, longitude: 77.59 },
            primaryTypeDisplayName: { text: "Park" },
            rating: 4.6,
            userRatingCount: 120000,
            priceLevel: "PRICE_LEVEL_FREE",
            currentOpeningHours: { openNow: true },
            regularOpeningHours: { periods: [{ open: { day: 1, hour: 6, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } }] },
            googleMapsUri: "https://maps.google.com/?cid=1",
          },
          { id: "nameless" },
        ],
      }),
    );
    const found = await createGooglePlacesProvider({ apiKey: "key", fetch }).findNearby!({ text: "park", near: { latitude: 12.9, longitude: 77.6 }, radiusMeters: 3000, openNow: true, max: 5 });
    expect(found).toEqual([
      {
        placeId: "p1",
        name: "Cubbon Park",
        address: "Kasturba Road, Bengaluru",
        location: { latitude: 12.97, longitude: 77.59 },
        kind: "Park",
        rating: 4.6,
        ratingCount: 120000,
        priceLevel: 0,
        openNow: true,
        periods: [{ open: { day: 1, minute: 360 }, close: { day: 1, minute: 1080 } }],
        mapsUri: "https://maps.google.com/?cid=1",
      },
    ]);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ textQuery: "park", pageSize: 5, openNow: true, locationBias: { circle: { center: { latitude: 12.9, longitude: 77.6 }, radius: 3000 } } });
    const mask = (calls[0]!.init.headers as Record<string, string>)["x-goog-fieldmask"];
    expect(mask).toContain("places.regularOpeningHours.periods");
    expect(mask).not.toContain("reviews");
  });
});

describe("opening hours", () => {
  const weekdays = [1, 2, 3, 4, 5].map((day) => ({ open: { day, minute: 11 * 60 }, close: { day, minute: 22 * 60 } }));

  it("is open for a window that sits inside a period, and not for one that runs past closing", () => {
    expect(isOpenFor(weekdays, 3, 15 * 60 + 30, 120)).toBe(true);
    expect(isOpenFor(weekdays, 3, 21 * 60, 120)).toBe(false);
    expect(isOpenFor(weekdays, 0, 15 * 60, 60)).toBe(false);
  });

  it("handles a period past midnight and one that wraps the week", () => {
    const lateBar = [{ open: { day: 6, minute: 20 * 60 }, close: { day: 0, minute: 2 * 60 } }];
    expect(isOpenFor(lateBar, 6, 23 * 60, 120)).toBe(true);
    expect(isOpenFor(lateBar, 0, 60, 30)).toBe(true);
  });

  it("is open around the clock with no close, and unknown with no hours", () => {
    expect(isOpenFor([{ open: { day: 0, minute: 0 }, close: null }], 4, 600, 600)).toBe(true);
    expect(isOpenFor([], 4, 600, 60)).toBeNull();
  });

  it("measures straight-line distance", () => {
    expect(Math.round(metresBetween({ latitude: 12.9716, longitude: 77.5946 }, { latitude: 12.9352, longitude: 77.6245 }) / 100)).toBe(52);
  });
});
