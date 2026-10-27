import { describe, expect, it } from "vitest";

import { carriesPlaceDetail, isPlaceQuestion, placeRequestForTurn, placeRequestFrom, readPlaceRequest } from "./request";

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

  it("reads going out with no kind named as a place question, answered and said back as assumed (the owner's report, 2026-10-21)", () => {
    expect(isPlaceQuestion("can we go somewhere out tomorrow")).toBe(true);
    expect(isPlaceQuestion("go out tomorrow")).toBe(false); // no asking word: a statement, unless the turn is already a place question
    expect(readPlaceRequest("can we go somewhere out tomorrow")).toMatchObject({
      purpose: "outing",
      label: "going out",
      query: "family outing places",
      assumed: "kind",
      anchor: { kind: "home" },
      dayOffset: 1,
      when: { kind: "today", minute: 11 * 60, forMinutes: 180 },
    });
    expect(readPlaceRequest("go out tomorrow", { asked: true })).toMatchObject({ purpose: "outing", assumed: "kind", dayOffset: 1, when: { minute: 11 * 60 } });
    // A place question the model recognised but no rule could: still answered, never asked "what kind?".
    expect(readPlaceRequest("anything fun to do with everyone?", { asked: true })).not.toBeNull();
    expect(readPlaceRequest("hmm, somewhere", { asked: true })).toMatchObject({ assumed: "kind", when: { kind: "now" } });
  });

  it("reads the short way a place is asked for, with no asking word", () => {
    expect(isPlaceQuestion("dinner nearby home")).toBe(true);
    expect(readPlaceRequest("dinner nearby home")).toMatchObject({ purpose: "eat", label: "dinner", query: "restaurant for dinner", anchor: { kind: "home" }, when: { kind: "today", minute: 19 * 60 + 30 } });
    expect(readPlaceRequest("dinner nearby home")!.dayOffset).toBeUndefined();
    expect(readPlaceRequest("somewhere to eat near home")).toMatchObject({ purpose: "eat", label: "somewhere to eat", anchor: { kind: "home" }, when: { kind: "now" } });
    expect(readPlaceRequest("a park near us")).toMatchObject({ purpose: "outing", anchor: { kind: "home" } });
    // A command is never the short form, and neither is a long sentence.
    expect(isPlaceQuestion("plan dinner near home")).toBe(false);
    expect(isPlaceQuestion("add pizza nearby")).toBe(false);
    expect(isPlaceQuestion("the dinner we had nearby home was lovely yesterday")).toBe(false);
  });

  it("reads tomorrow as tomorrow's window, a meal at its time and anything else in the daytime", () => {
    expect(readPlaceRequest("suggest somewhere for dinner tomorrow")).toMatchObject({ dayOffset: 1, when: { kind: "today", minute: 19 * 60 + 30 } });
    expect(readPlaceRequest("somewhere to eat tomorrow", { asked: true })).toMatchObject({ purpose: "eat", dayOffset: 1, when: { kind: "today", minute: 13 * 60 } });
    expect(readPlaceRequest("suggest a park for the day after tomorrow")).toMatchObject({ dayOffset: 2 });
  });

  it("reads a follow-up together with the request before it: what it says wins, what it leaves unsaid is carried", () => {
    const first = readPlaceRequest("can we go somewhere out tomorrow")!;
    // The owner's second turn: dinner, near home, and still tomorrow.
    expect(readPlaceRequest("dinner nearby home", { asked: true, earlier: first })).toMatchObject({ purpose: "eat", label: "dinner", anchor: { kind: "home" }, dayOffset: 1, when: { kind: "today", minute: 19 * 60 + 30 } });
    expect(readPlaceRequest("dinner nearby home", { asked: true, earlier: first })!.assumed).toBeUndefined();
    // A kind named before, a place or a day changed now.
    const dinner = readPlaceRequest("suggest somewhere for dinner tonight")!;
    expect(readPlaceRequest("near Anya's school", { asked: true, earlier: dinner })).toMatchObject({ purpose: "eat", label: "dinner", anchor: { kind: "school", childName: "Anya" }, radiusMeters: 4_000 });
    expect(readPlaceRequest("tomorrow instead", { asked: true, earlier: dinner })).toMatchObject({ purpose: "eat", dayOffset: 1, when: { minute: 19 * 60 + 30 } });
    expect(readPlaceRequest("tonight", { asked: true, earlier: readPlaceRequest("suggest somewhere for dinner tomorrow") })!.dayOffset).toBeUndefined();
  });

  it("knows what a short answer to a place question carries", () => {
    expect(carriesPlaceDetail("dinner nearby home")).toBe(true);
    expect(carriesPlaceDetail("a park")).toBe(true);
    expect(carriesPlaceDetail("tomorrow")).toBe(true);
    expect(carriesPlaceDetail("Anya", ["Anya Sharma", "Kabir Sharma"])).toBe(true);
    expect(carriesPlaceDetail("thanks")).toBe(false);
    expect(carriesPlaceDetail("ok great")).toBe(false);
  });

  it("reads back a stored request defensively, and names a child from a bare answer to \"whose school?\"", () => {
    const stored = readPlaceRequest("suggest a park near school after school")!;
    expect(placeRequestFrom({ placeRequest: JSON.parse(JSON.stringify({ ...stored, asked: "which_child" })) })).toEqual({ ...stored, asked: "which_child" });
    expect(placeRequestFrom({ placeRequest: { purpose: "spy" } })).toBeNull();
    expect(placeRequestFrom(null)).toBeNull();
    const answered = placeRequestForTurn({ utterance: "Anya", earlier: { ...stored, asked: "which_child" }, children: [{ name: "Anya Sharma" }, { name: "Kabir Sharma" }] });
    expect(answered.anchor).toEqual({ kind: "school", childName: "Anya" });
    expect(answered.asked).toBeUndefined();
    // Not a name on record: the question stays asked, so it is never asked again.
    expect(placeRequestForTurn({ utterance: "the big one", earlier: { ...stored, asked: "which_child" }, children: [{ name: "Anya Sharma" }] }).asked).toBe("which_child");
  });

  it("reads a getaway of a few days: somewhere worth the drive from home, with no opening hours to check (the owner, 2026-10-18)", () => {
    expect(readPlaceRequest("Okay. Can you suggest a two-day vacation plan?")).toMatchObject({ purpose: "getaway", label: "a 2-day getaway", anchor: { kind: "home" }, when: { kind: "trip", days: 2 }, radiusMeters: 200_000 });
    expect(readPlaceRequest("suggest a weekend getaway for the family")).toMatchObject({ purpose: "getaway", forChildren: true, when: { kind: "trip", days: 2 } });
    expect(readPlaceRequest("any ideas for a 4 day holiday?")).toMatchObject({ purpose: "getaway", query: "hill station weekend getaway", placeType: "tourist_attraction", when: { kind: "trip", days: 4 } });
    expect(readPlaceRequest("any ideas for a week-long holiday?")).toMatchObject({ purpose: "getaway", query: "holiday destination", when: { kind: "trip", days: 7 } });
    expect(readPlaceRequest("suggest somewhere for dinner on our trip")).toMatchObject({ purpose: "eat" });
    expect(isPlaceQuestion("we went on a trip last week")).toBe(false);
  });
});


// The owner, 2026-10-27: "where can we go this weekend, add maps link".
describe("this weekend, with map links", () => {
  it("is going out at the weekend, its places with their map links", () => {
    expect(readPlaceRequest("where can we go this weekend, add maps link")).toMatchObject({ purpose: "outing", label: "going out", assumed: "kind", weekend: true, mapLinks: true, when: { kind: "today", minute: 11 * 60 } });
    expect(readPlaceRequest("where can we go for dinner")).not.toHaveProperty("mapLinks");
  });
});
