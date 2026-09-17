import { describe, expect, it } from "vitest";

import { ageBandFor, completedYears, needsAgeReview, parseDateOfBirth } from "./age";

const on = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe("age bands", () => {
  it("counts completed years, not started ones", () => {
    const dob = parseDateOfBirth("2016-09-18")!;
    expect(completedYears(dob, on("2026-09-17"))).toBe(9);
    expect(completedYears(dob, on("2026-09-18"))).toBe(10);
  });

  it("moves a child into the next band on their birthday, not before", () => {
    const dob = parseDateOfBirth("2013-06-01")!;
    expect(ageBandFor(dob, on("2026-05-31"))).toBe("older_child");
    expect(ageBandFor(dob, on("2026-06-01"))).toBe("teen");
  });

  it("handles a 29 February birthday without drifting", () => {
    const dob = parseDateOfBirth("2016-02-29")!;
    // In a non-leap year the birthday is treated as 1 March: on 28 February the
    // year is not yet complete.
    expect(completedYears(dob, on("2026-02-28"))).toBe(9);
    expect(completedYears(dob, on("2026-03-01"))).toBe(10);
  });

  it("bands the whole range", () => {
    expect(ageBandFor(parseDateOfBirth("2022-01-01"), on("2026-09-17"))).toBe("young_child");
    expect(ageBandFor(parseDateOfBirth("2017-01-01"), on("2026-09-17"))).toBe("older_child");
    expect(ageBandFor(parseDateOfBirth("2011-01-01"), on("2026-09-17"))).toBe("teen");
    expect(ageBandFor(parseDateOfBirth("2000-01-01"), on("2026-09-17"))).toBe("adult");
  });

  it("returns no band when the date of birth is unknown", () => {
    expect(ageBandFor(null)).toBeNull();
    expect(ageBandFor(parseDateOfBirth(""))).toBeNull();
  });

  it("never reports a negative age for a date in the future", () => {
    expect(completedYears(parseDateOfBirth("2030-01-01")!, on("2026-09-17"))).toBe(0);
  });

  it("rejects an impossible date rather than rolling it over", () => {
    expect(parseDateOfBirth("2026-02-31")).toBeNull();
    expect(parseDateOfBirth("2026-13-01")).toBeNull();
    expect(parseDateOfBirth("not-a-date")).toBeNull();
  });

  it("parses a calendar date as a calendar date, independent of local zone", () => {
    const dob = parseDateOfBirth("2016-09-18")!;
    expect(dob.getUTCFullYear()).toBe(2016);
    expect(dob.getUTCMonth()).toBe(8);
    expect(dob.getUTCDate()).toBe(18);
  });

  it("flags a child who has reached adulthood for review rather than acting alone", () => {
    expect(needsAgeReview(parseDateOfBirth("2008-09-17"), on("2026-09-17"))).toBe(true);
    expect(needsAgeReview(parseDateOfBirth("2008-09-18"), on("2026-09-17"))).toBe(false);
  });
});
