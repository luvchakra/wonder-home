import { describe, expect, it } from "vitest";

import { createHouseholdSchema, timezoneSchema } from "./schemas";

describe("create household input", () => {
  it("accepts a household with a valid zone", () => {
    const parsed = createHouseholdSchema.parse({
      householdName: "Chakraborty Home",
      displayName: "Kunal",
      timezone: "Asia/Kolkata",
    });
    expect(parsed.householdName).toBe("Chakraborty Home");
  });

  it("defaults to the household's expected zone when none is given", () => {
    const parsed = createHouseholdSchema.parse({
      householdName: "Home",
      displayName: "Kunal",
    });
    expect(parsed.timezone).toBe("Asia/Kolkata");
  });

  it("trims names rather than storing padded values", () => {
    const parsed = createHouseholdSchema.parse({
      householdName: "  Chakraborty Home  ",
      displayName: " Kunal ",
    });
    expect(parsed.householdName).toBe("Chakraborty Home");
    expect(parsed.displayName).toBe("Kunal");
  });

  it("rejects a name that is only whitespace", () => {
    expect(() =>
      createHouseholdSchema.parse({ householdName: "   ", displayName: "Kunal" }),
    ).toThrowError();
  });

  it("rejects a name beyond the column's limit instead of letting the database refuse it", () => {
    expect(() =>
      createHouseholdSchema.parse({ householdName: "x".repeat(81), displayName: "Kunal" }),
    ).toThrowError();
  });

  it("validates the zone against the runtime tz database, not a hand-kept list", () => {
    expect(timezoneSchema.parse("Europe/Lisbon")).toBe("Europe/Lisbon");
    expect(() => timezoneSchema.parse("Mars/Olympus_Mons")).toThrowError(/IANA/);
  });
});
