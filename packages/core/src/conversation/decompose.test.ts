import { describe, expect, it } from "vitest";

import { heldBecause, leansOnEarlier, splitRequest } from "./decompose";

describe("splitting a request into its parts (Wave 4 §10)", () => {
  it("splits where a new request begins", () => {
    expect(splitRequest("Add milk and bananas, and remind me to buy them tomorrow.")).toEqual(["Add milk and bananas", "remind me to buy them tomorrow"]);
    expect(splitRequest("Plan pasta for tonight and make sure we have everything")).toEqual(["Plan pasta for tonight", "make sure we have everything"]);
    expect(splitRequest("Sunita is away tomorrow. Add milk")).toEqual(["Sunita is away tomorrow", "Add milk"]);
  });

  it("keeps a list of things, a dish, and a reminder's own verb in one piece", () => {
    expect(splitRequest("Add milk and bananas")).toEqual(["Add milk and bananas"]);
    expect(splitRequest("we need mac and cheese")).toEqual(["we need mac and cheese"]);
    expect(splitRequest("remind me to buy them tomorrow")).toEqual(["remind me to buy them tomorrow"]);
    expect(splitRequest("remind me tomorrow to add milk")).toEqual(["remind me tomorrow to add milk"]);
  });

  it("a sentence with too many parts is read as one request, not guessed at", () => {
    expect(splitRequest("add milk and add eggs and add bread and add rice and add salt")).toHaveLength(1);
  });
});

describe("the premise rule: a part that leans on an earlier one waits for it to have happened", () => {
  it("knows which parts lean on what came before", () => {
    expect(leansOnEarlier("remind me to buy them tomorrow")).toBe(true);
    expect(leansOnEarlier("make sure we have everything")).toBe(true);
    expect(leansOnEarlier("add bread")).toBe(false);
  });

  it("goes ahead only when every earlier part was done", () => {
    expect(heldBecause("remind me to buy them tomorrow", [{ part: "Add milk and bananas", outcome: "done" }])).toBeNull();
    expect(heldBecause("remind me to buy them tomorrow", [{ part: "Add milk and bananas", outcome: "failed" }])).toMatch(/did not go through/);
    expect(heldBecause("make sure we have everything", [{ part: "Plan pasta for tonight", outcome: "waiting" }])).toMatch(/waiting for your yes/);
    expect(heldBecause("make sure we have everything", [{ part: "Plan pasta", outcome: "asked" }])).toMatch(/asked you something/);
  });

  it("a part that stands on its own is never held back by another's failure", () => {
    expect(heldBecause("add bread", [{ part: "pay the water bill", outcome: "failed" }])).toBeNull();
  });
});
