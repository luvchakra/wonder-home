import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { PlaceResult, PlacesProvider } from "../places/provider";
import { placesReply } from "./answer";
import { readPlaceRequest } from "./request";
import { householdNow, placesFrom, rankPlaces, suggestPlaces } from "./service";

const school = { latitude: 12.97, longitude: 77.59 };
// Every weekday, 10:00 to 21:00.
const daytime = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ open: { day, minute: 600 }, close: { day, minute: 1260 } }));

function place(id: string, overrides: Partial<PlaceResult> = {}): PlaceResult {
  return {
    placeId: id,
    name: `Place ${id}`,
    address: "Somewhere",
    location: { latitude: school.latitude + 0.005, longitude: school.longitude },
    kind: "Park",
    rating: 4.2,
    ratingCount: 300,
    priceLevel: null,
    openNow: null,
    periods: daytime,
    mapsUri: `https://maps.google.com/?cid=${id}`,
    ...overrides,
  };
}

const unreadable = { from: () => { throw new Error("no database in this test"); } } as unknown as SupabaseClient;
const window = { day: 3, minute: 15 * 60 + 30, forMinutes: 120, now: false };

describe("rankPlaces", () => {
  it("drops places closed for the window and places the family turned down", () => {
    const ranked = rankPlaces(
      [place("open"), place("closed", { periods: [{ open: { day: 3, minute: 600 }, close: { day: 3, minute: 960 } }] }), place("no")],
      { anchor: school, window, radiusMeters: 4000, known: [{ id: "1", placeId: "no", name: "No", address: "", kind: null, location: null, mapsUri: null, status: "not_for_us", note: null }] },
    );
    expect(ranked.map((entry) => entry.placeId)).toEqual(["open"]);
  });

  it("puts a saved place first and ranks unknown hours below known ones", () => {
    const ranked = rankPlaces(
      [place("unknown", { periods: [], rating: 4.6 }), place("good", { rating: 4.5 }), place("mine", { rating: 3.9 })],
      { anchor: school, window, radiusMeters: 4000, known: [{ id: "1", placeId: "mine", name: "Mine", address: "", kind: "Park", location: null, mapsUri: null, status: "saved", note: null }] },
    );
    expect(ranked.map((entry) => entry.placeId)).toEqual(["mine", "good", "unknown"]);
    expect(ranked[0]!.saved).toBe(true);
    expect(ranked[2]!.openForWindow).toBeNull();
  });

  it("drops places far outside the radius", () => {
    const ranked = rankPlaces([place("far", { location: { latitude: school.latitude + 0.2, longitude: school.longitude } })], { anchor: school, window, radiusMeters: 4000, known: [] });
    expect(ranked).toEqual([]);
  });
});

describe("suggestPlaces", () => {
  const provider = (found: PlaceResult[]): PlacesProvider => ({
    name: "fake",
    search: async () => [],
    details: async () => null,
    findNearby: async () => found,
  });
  const context = {
    householdId: "h",
    now: { day: 3, minute: 10 * 60 },
    children: [{ id: "c1", name: "Anya Sharma" }, { id: "c2", name: "Kabir Sharma" }],
    schools: [
      { childMemberId: "c1", schoolName: "Greenwood High", location: school },
      { childMemberId: "c2", schoolName: "Lakeside School", location: { latitude: 13.0, longitude: 77.6 } },
    ],
  };

  it("finds places near the named child's school, after school, saying the assumption", async () => {
    const request = readPlaceRequest("Where can we hang out near Anya's school after school ends?")!;
    const outcome = await suggestPlaces(unreadable, provider([place("p1")]), request, context);
    expect(outcome).toMatchObject({ kind: "found", near: "Anya's school", window: "after school, from 3:30 pm" });
    const text = placesReply(request, outcome);
    expect(text).toContain("near Anya's school");
    expect(text).toContain("I've taken school as finishing around 3:30 pm.");
  });

  it("asks whose school when two children go to different schools and none is named", async () => {
    const request = readPlaceRequest("Suggest a park near school after school")!;
    expect(await suggestPlaces(unreadable, provider([place("p1")]), request, context)).toEqual({ kind: "which_child", names: ["Anya Sharma", "Kabir Sharma"] });
  });

  it("is off without a provider that can search nearby", async () => {
    const request = readPlaceRequest("Suggest some good places for dinner tonight")!;
    expect(await suggestPlaces(unreadable, null, request, context)).toEqual({ kind: "off" });
  });
});

describe("placesFrom", () => {
  it("reads stored places back and drops anything malformed", () => {
    const stored = { places: [{ placeId: "a", name: "A", location: { latitude: 1, longitude: 2 }, mapsUri: "javascript:alert(1)", rating: 4 }, { name: "no id" }, "junk"] };
    const read = placesFrom(stored);
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({ placeId: "a", rating: 4, mapsUri: null });
    expect(placesFrom(null)).toEqual([]);
  });
});

describe("householdNow", () => {
  it("reads the weekday and minute on the household's clock", () => {
    // 2026-10-14 is a Wednesday; 20:00 UTC is 01:30 Thursday in Kolkata.
    expect(householdNow(new Date("2026-10-14T20:00:00Z"), "Asia/Kolkata")).toEqual({ day: 4, minute: 90 });
  });
});
