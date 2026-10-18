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

  it("starts after school when that school's day actually ends, with nothing assumed", async () => {
    const request = readPlaceRequest("Where can we hang out near Anya's school after school ends?")!;
    const timed = { ...context, schools: [{ ...context.schools[0]!, endsMinute: 15 * 60 + 10 }, context.schools[1]!] };
    const outcome = await suggestPlaces(unreadable, provider([place("p1")]), request, timed);
    expect(outcome).toMatchObject({ kind: "found", window: "after school, from 3:10 pm", assumption: null });
    expect(placesReply(request, outcome)).not.toContain("I've taken");
  });

  it("starts after work at the speaker's own office hours, or says what it assumed", async () => {
    const request = readPlaceRequest("Suggest somewhere to eat near Anya's school after work")!;
    expect(request.when.kind).toBe("after_work");
    const known = await suggestPlaces(unreadable, provider([place("p1")]), request, { ...context, workEndsMinute: 17 * 60 + 30 });
    expect(known).toMatchObject({ kind: "found", window: "after work, from 5:30 pm", assumption: null });
    const assumed = await suggestPlaces(unreadable, provider([place("p1")]), request, context);
    expect(assumed).toMatchObject({ kind: "found", window: "after work, from 6 pm" });
    expect(placesReply(request, assumed)).toContain("I've taken work as finishing around 6 pm. Add your office hours to your details in Settings");
  });

  it("asks whose school when two children go to different schools and none is named", async () => {
    const request = readPlaceRequest("Suggest a park near school after school")!;
    expect(await suggestPlaces(unreadable, provider([place("p1")]), request, context)).toEqual({ kind: "which_child", names: ["Anya Sharma", "Kabir Sharma"] });
  });

  it("searches near the speaker's office, or a named adult's, and says what is missing", async () => {
    const office = { latitude: school.latitude + 0.004, longitude: school.longitude };
    const withOffices = {
      ...context,
      speakerMemberId: "m1",
      workPlaces: [
        { memberId: "m1", personName: "Kunal Sharma", location: office },
        { memberId: "m2", personName: "Asha Sharma", location: office },
      ],
    };
    const mine = readPlaceRequest("somewhere for lunch near my office")!;
    expect(await suggestPlaces(unreadable, provider([place("p1")]), mine, withOffices)).toMatchObject({ kind: "found", near: "your office" });
    const hers = readPlaceRequest("suggest a cafe near Asha's office")!;
    const found = await suggestPlaces(unreadable, provider([place("p1")]), hers, withOffices);
    expect(found).toMatchObject({ kind: "found", near: "Asha's office" });
    expect(placesReply(hers, found)).toContain("near Asha's office");

    const unknownOwn = await suggestPlaces(unreadable, provider([place("p1")]), mine, { ...context, speakerMemberId: "m9" });
    expect(unknownOwn).toEqual({ kind: "needs_work", personName: null });
    expect(placesReply(mine, unknownOwn)).toContain("Pick it under your details in Settings");
    const unknownOther = await suggestPlaces(unreadable, provider([place("p1")]), readPlaceRequest("any good cafes near Ravi's office")!, withOffices);
    expect(unknownOther).toEqual({ kind: "needs_work", personName: "Ravi" });
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
