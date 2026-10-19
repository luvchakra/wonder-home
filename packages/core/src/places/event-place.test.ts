import { describe, expect, it } from "vitest";

import { decideEventPlace, mapsLinkFor, needsLookup, NO_PLACE, type EventPlace } from "./event-place";

const garden = { placeId: "ChIJgarden", name: "Lodhi Garden", formattedAddress: "Lodhi Rd, New Delhi, Delhi 110003", latitude: 28.59, longitude: 77.22 };
const onRecord: EventPlace = { location: "Lodhi Garden", locationPlaceId: "ChIJgarden", locationAddress: "Lodhi Rd, New Delhi, Delhi 110003" };

describe("an event's place", () => {
  it("keeps a picked place's name, address and id as the provider gives them", () => {
    expect(decideEventPlace({ placeId: "ChIJgarden", typed: "lodhi" }, null, garden)).toEqual(onRecord);
  });

  it("keeps a typed place as written, with no address or id", () => {
    expect(decideEventPlace({ placeId: null, typed: "  Home " }, onRecord, null)).toEqual({ location: "Home", locationPlaceId: null, locationAddress: null });
  });

  it("asks the provider only for a new pick", () => {
    expect(needsLookup({ placeId: "ChIJgarden", typed: "Lodhi Garden" }, onRecord)).toBe(false);
    expect(needsLookup({ placeId: "ChIJother", typed: "Other" }, onRecord)).toBe(true);
    expect(needsLookup({ placeId: null, typed: "Home" }, onRecord)).toBe(false);
    expect(decideEventPlace({ placeId: "ChIJgarden", typed: "Lodhi Garden" }, onRecord, null)).toBe(onRecord);
  });

  it("falls back to the typed words when the pick cannot be read, never to an address from the browser", () => {
    expect(decideEventPlace({ placeId: "ChIJother", typed: "Some park" }, null, null)).toEqual({ location: "Some park", locationPlaceId: null, locationAddress: null });
    expect(decideEventPlace({ placeId: "ChIJother", typed: "Some park" }, null, garden)).toEqual({ location: "Some park", locationPlaceId: null, locationAddress: null });
  });

  it("clears the place when the box is emptied", () => {
    expect(decideEventPlace({ placeId: null, typed: "" }, onRecord, null)).toBe(NO_PLACE);
  });

  it("opens a picked place in Google Maps by name, address and id, and never links a typed one", () => {
    expect(mapsLinkFor(onRecord)).toBe("https://www.google.com/maps/search/?api=1&query=Lodhi+Garden%2C+Lodhi+Rd%2C+New+Delhi%2C+Delhi+110003&query_place_id=ChIJgarden");
    expect(mapsLinkFor({ location: "Home" })).toBeNull();
    expect(mapsLinkFor(NO_PLACE)).toBeNull();
  });
});
