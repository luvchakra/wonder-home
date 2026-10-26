import { describe, expect, it } from "vitest";

import { asAutoAddPercent, AUTO_ADD_PERCENTS, DEFAULT_AUTO_ADD_PERCENT, scorePercent } from "./auto-add";

describe("HomeSend's bar for adding on its own", () => {
  it("offers only the bars WonderHome lists, 95 by default", () => {
    expect(DEFAULT_AUTO_ADD_PERCENT).toBe(95);
    expect(AUTO_ADD_PERCENTS).toContain(95);
    expect(asAutoAddPercent(85)).toBe(85);
    expect(asAutoAddPercent("70")).toBe(70);
    for (const odd of [0, 50, 100, 94, "abc", null, undefined]) expect(asAutoAddPercent(odd)).toBe(95);
  });

  it("shows a reading's score as a whole percent", () => {
    expect(scorePercent(0.97)).toBe(97);
    expect(scorePercent(0.7)).toBe(70);
    expect(scorePercent(undefined)).toBeNull();
  });
});
