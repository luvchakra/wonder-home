import { describe, expect, it } from "vitest";

import { petPreferenceSentence, sortPetPreferences } from "./pet-preferences";

describe("a pet's likes", () => {
  it("are said in one sentence for HomeBrain, likes first, a named kind as written", () => {
    expect(
      petPreferenceSentence("Bruno", [
        { kind: "dislike", subject: "baths", note: null },
        { kind: "favourite_place", subject: "the park", note: "the big one near school" },
        { kind: "like", subject: "chicken", note: null },
        { kind: "like", subject: "belly rubs", note: null },
        { kind: "bedtime_spot", subject: "the sofa", note: null },
        { kind: "allergy", subject: "wheat", note: null },
      ]),
    ).toBe("Bruno likes belly rubs and chicken; dislikes baths; favourite place: the park (the big one near school); is allergic to wheat; bedtime spot: the sofa.");
  });

  it("say nothing when nothing is on record", () => {
    expect(petPreferenceSentence("Bruno", [])).toBeNull();
  });

  it("keep the known kinds in order before the household's own", () => {
    expect(sortPetPreferences([{ kind: "zzz", subject: "a" }, { kind: "fear", subject: "b" }, { kind: "like", subject: "c" }]).map((entry) => entry.kind)).toEqual(["like", "fear", "zzz"]);
  });
});
