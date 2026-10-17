import { describe, expect, it } from "vitest";

import { createGooglePlacesProvider, placesProviderFromEnv, SCHOOL_RADIUS_METERS } from "./google";
import { distanceLabel, mapsLink, PlacesUnavailableError } from "./provider";

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
