import { describe, expect, it } from "vitest";

import { minimiseContext, unpseudonymise, DEFAULT_DATA_USE, type Person } from "./privacy";

const people: Person[] = [
  { id: "m-anaya", displayName: "Anaya Rao", memberType: "child" },
  { id: "m-priya", displayName: "Priya Rao", memberType: "adult" },
  { id: "m-sunita", displayName: "Sunita", memberType: "helper" },
];

describe("mapping a provider's placeholder back to the household", () => {
  const { pseudonyms } = minimiseContext([], { policy: DEFAULT_DATA_USE, people });

  it("turns the placeholder the provider saw back into the person", () => {
    const placeholder = pseudonyms["m-anaya"]!;
    expect(unpseudonymise(placeholder.toLowerCase(), pseudonyms, people)).toEqual({ reference: "anaya", memberId: "m-anaya" });
  });

  it("leaves a first name the member typed alone, and still finds who it is", () => {
    expect(unpseudonymise("sunita", pseudonyms, people)).toEqual({ reference: "sunita", memberId: "m-sunita" });
  });

  it("passes through a name it cannot place, with no member", () => {
    expect(unpseudonymise("grandma", pseudonyms, people)).toEqual({ reference: "grandma", memberId: null });
  });
});
