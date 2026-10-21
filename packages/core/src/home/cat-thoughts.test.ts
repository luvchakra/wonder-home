import { afterEach, describe, expect, it, vi } from "vitest";

import { acceptableThought, catThoughts, resetThoughtPools, settleThoughts, thoughtsSystemPrompt } from "./cat-thoughts";

afterEach(() => resetThoughtPools());

describe("acceptableThought", () => {
  it("keeps one short, plain sentence", () => {
    expect(acceptableThought("  That sunbeam is   mine today. ")).toBe("That sunbeam is mine today.");
    expect(acceptableThought("धूप वाली खिड़की मेरी है।")).toBe("धूप वाली खिड़की मेरी है।");
  });

  it("refuses anything that could read as information, or more than one sentence", () => {
    for (const line of [
      "Dinner is at 8 tonight.",
      "Visit https://example.com for naps.",
      'The box said "fragile".',
      "I nap. Then I nap again.",
      "我在晒太阳。然后睡觉。",
      "Sunbeams 😺",
      "x",
      "a".repeat(120),
      42,
    ]) {
      expect(acceptableThought(line)).toBeNull();
    }
  });
});

describe("catThoughts", () => {
  it("answers at once, fills in the background, and keeps only acceptable lines", async () => {
    const model = vi.fn(async () => ["Warm laps are the best laps.", "Dinner at 7.", "The window is my television.", "Yarn fears me.", "Yarn fears me."]);
    expect(catThoughts("en", model, 0)).toEqual([]);
    await settleThoughts("en", 1000);
    expect(catThoughts("en", model, 1)).toEqual(["Warm laps are the best laps.", "The window is my television.", "Yarn fears me."]);
    expect(model).toHaveBeenCalledTimes(1);
    expect(model).toHaveBeenCalledWith("English");
  });

  it("sends nothing but the language, and stays empty without a model or on failure", async () => {
    expect(thoughtsSystemPrompt("Hindi")).toContain("in Hindi");
    expect(catThoughts("hi", null)).toEqual([]);
    const broken = vi.fn(async () => null);
    catThoughts("fr", broken, 0);
    await settleThoughts("fr", 1000);
    expect(catThoughts("fr", broken, 1)).toEqual([]);
    expect(broken).toHaveBeenCalledTimes(1);
  });
});
