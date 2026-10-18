import { describe, expect, it } from "vitest";

import { hopsFor, readGoal } from "./goal";

describe("readGoal (HomeBrain 4.0 §3.10)", () => {
  it.each([
    ["When is movie night?", "find_out"],
    ["How many people are coming to Asmi's birthday?", "find_out"],
    ["Okay, so who are the family members?", "find_out"],
    ["Should we do movie night on Thursday?", "decide"],
    ["Is it a good idea to go out on Friday?", "decide"],
    ["Which day is better for the dinner party?", "decide"],
    ["I'm planning a movie night on Friday", "plan"],
    ["Let's have friends over on Saturday", "plan"],
    ["Can we go to the zoo this Sunday?", "plan"],
    ["Is there anything on Thursday?", "check"],
    ["Did Kunal pay the electricity bill?", "check"],
    ["Do we have milk?", "check"],
    ["Remember that Asmi likes paneer", "remember"],
    ["Add milk to the list", "do"],
  ] as const)("%s → %s", (question, goal) => {
    expect(readGoal(question)).toBe(goal);
  });

  it("goes two links out only to plan or decide", () => {
    expect(hopsFor("plan")).toBe(2);
    expect(hopsFor("decide")).toBe(2);
    expect(hopsFor("find_out")).toBe(1);
    expect(hopsFor("check")).toBe(1);
  });
});
