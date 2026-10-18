import { describe, expect, it } from "vitest";

import { isPlaceQuestion, readPlaceRequest } from "./request";

describe("reading a place question", () => {
  it("dinner tonight near home", () => {
    const request = readPlaceRequest("Suggest some good places for dinner tonight")!;
    expect(request).toMatchObject({ purpose: "eat", label: "dinner", anchor: { kind: "home" }, when: { kind: "today", minute: 19 * 60 + 30, label: "7:30 pm" } });
    expect(request.query).toBe("restaurant for dinner");
  });

  it("a hangout near a named child's school after school, for children", () => {
    const request = readPlaceRequest("Where can we hang out near Anya's school after her school ends?")!;
    expect(request).toMatchObject({ purpose: "outing", forChildren: true, anchor: { kind: "school", childName: "Anya" }, when: { kind: "after_school" } });
    expect(request.query).toBe("park or play area for kids");
    expect(request.radiusMeters).toBeLessThan(5000);
  });

  it("a time said aloud, and a cuisine", () => {
    expect(readPlaceRequest("find us a pizza place for dinner at 8")!).toMatchObject({ query: "pizza restaurant for dinner", when: { kind: "today", minute: 20 * 60 } });
    expect(readPlaceRequest("any good cafes open now")!.when).toEqual({ kind: "now" });
    expect(readPlaceRequest("recommend a family restaurant for lunch")!.query).toBe("family friendly restaurant for lunch");
  });

  it("after work, in the ways people say it", () => {
    expect(readPlaceRequest("suggest somewhere for dinner after work")!.when).toEqual({ kind: "after_work", forMinutes: 120 });
    expect(readPlaceRequest("any good cafes near home when I finish work?")!.when).toEqual({ kind: "after_work", forMinutes: 120 });
    expect(readPlaceRequest("places to hang out after office")!.when.kind).toBe("after_work");
  });

  it("near the speaker's office, or a named person's", () => {
    expect(readPlaceRequest("somewhere for lunch near my office")!).toMatchObject({ purpose: "eat", anchor: { kind: "work", personName: null }, radiusMeters: 4_000 });
    expect(readPlaceRequest("any good cafes close to work?")!.anchor).toEqual({ kind: "work", personName: null });
    expect(readPlaceRequest("suggest a place for dinner around Kunal's office after work")!).toMatchObject({ anchor: { kind: "work", personName: "Kunal" }, when: { kind: "after_work" } });
    // Finishing work is a time, not a place.
    expect(readPlaceRequest("any good cafes near home when I finish work?")!.anchor).toEqual({ kind: "home" });
    expect(readPlaceRequest("suggest somewhere for dinner after work")!.anchor).toEqual({ kind: "home" });
  });

  it("is not every sentence that mentions food", () => {
    expect(isPlaceQuestion("The food was good")).toBe(false);
    expect(isPlaceQuestion("add pizza to the list")).toBe(false);
    expect(isPlaceQuestion("plan dinner for Saturday")).toBe(false);
    expect(readPlaceRequest("what's going on")).toBeNull();
  });

  it("reads a getaway of a few days: somewhere worth the drive from home, with no opening hours to check (the owner, 2026-10-18)", () => {
    expect(readPlaceRequest("Okay. Can you suggest a two-day vacation plan?")).toMatchObject({ purpose: "getaway", label: "a 2-day getaway", anchor: { kind: "home" }, when: { kind: "trip", days: 2 }, radiusMeters: 200_000 });
    expect(readPlaceRequest("suggest a weekend getaway for the family")).toMatchObject({ purpose: "getaway", forChildren: true, when: { kind: "trip", days: 2 } });
    expect(readPlaceRequest("any ideas for a 4 day holiday?")).toMatchObject({ purpose: "getaway", query: "holiday destination", placeType: "tourist_attraction", when: { kind: "trip", days: 4 } });
    expect(readPlaceRequest("suggest somewhere for dinner on our trip")).toMatchObject({ purpose: "eat" });
    expect(isPlaceQuestion("we went on a trip last week")).toBe(false);
  });
});

