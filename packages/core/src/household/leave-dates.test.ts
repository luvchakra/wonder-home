import { describe, expect, it } from "vitest";

import { leaveDates, MAX_LEAVE_DAYS } from "./helpers-repository";

describe("leaveDates", () => {
  it("covers the first day and the days after it", () => {
    expect(leaveDates("2026-10-30", 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(leaveDates("2026-12-31", 2)).toEqual(["2026-12-31", "2027-01-01"]);
    expect(leaveDates("2028-02-28", 2)).toEqual(["2028-02-28", "2028-02-29"]);
  });
  it("refuses a date that is not real and a count out of range", () => {
    expect(leaveDates("2026-02-30", 1)).toEqual([]);
    expect(leaveDates("2026-10-30", 0)).toEqual([]);
    expect(leaveDates("2026-10-30", MAX_LEAVE_DAYS + 1)).toEqual([]);
    expect(leaveDates("2026-10-30", 1.5)).toEqual([]);
  });
});
