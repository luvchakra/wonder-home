import { describe, expect, it } from "vitest";

import { LONG_WEEKENDS_LEAD } from "../homebrain/insights";
import { tripDestinationRequest, withDestinations } from "./trip";

const WITH_LONG = `Here is when the family calendar is free:\n- ${LONG_WEEKENDS_LEAD} Fri 25 Dec to Sun 27 Dec (Christmas Day, Fri 25 Dec).`;
const PLAIN = "Here is when the family calendar is free:\n- For a 2-day getaway, nothing is on the family calendar on Sat 24 Oct to Sun 25 Oct.";

describe("destinations beside the free weekends", () => {
  it("searches a three-day getaway when a holiday makes a long weekend", () => {
    expect(tripDestinationRequest("which weekend is free for a trip?", WITH_LONG)).toMatchObject({ purpose: "getaway", when: { kind: "trip", days: 3 }, label: "a 3-day getaway", anchor: { kind: "home" } });
  });

  it("keeps the days the person said, and two for an ordinary weekend", () => {
    expect(tripDestinationRequest("what best time for 2 day getaway", WITH_LONG)).toMatchObject({ when: { kind: "trip", days: 2 } });
    expect(tripDestinationRequest("when can we take a four-day vacation", PLAIN)).toMatchObject({ when: { kind: "trip", days: 4 } });
    expect(tripDestinationRequest("which weekend is free for a trip?", PLAIN)).toMatchObject({ when: { kind: "trip", days: 2 } });
  });

  it("is only for a when-question about a trip", () => {
    expect(tripDestinationRequest("What is on this weekend?", PLAIN)).toBeNull();
    expect(tripDestinationRequest("when is the next holiday?", PLAIN)).toBeNull();
  });

  it("puts the places after the weekends", () => {
    expect(withDestinations("When.", "Where.")).toBe("When.\n\nWhere.");
  });
});
