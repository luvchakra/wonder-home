import { describe, expect, it } from "vitest";

import { resolveDay, resolveTemporal } from "./temporal";

// Wednesday 23 September 2026, 10:00 in Kolkata.
const WED = { timezone: "Asia/Kolkata", now: new Date("2026-09-23T04:30:00Z") };
const at = (phrase: string, options = WED) => resolveTemporal(phrase, options);

describe("temporal grounding (Wave 4 §7) — the phrase is the model's, the date is ours", () => {
  it("resolves the everyday words to the household's own local day", () => {
    expect(at("today")?.date).toBe("2026-09-23");
    expect(at("tomorrow")?.date).toBe("2026-09-24");
    expect(at("tomorrow")?.label).toBe("tomorrow (Thu 24 Sep)");
    expect(at("day after tomorrow")?.date).toBe("2026-09-25");
    expect(at("yesterday")?.date).toBe("2026-09-22");
  });

  it("reads the day in the household's zone, not the server's — late evening in UTC is already tomorrow in Kolkata", () => {
    const lateUtc = new Date("2026-09-22T20:00:00Z"); // 01:30 on the 23rd in Kolkata
    expect(at("today", { timezone: "Asia/Kolkata", now: lateUtc })?.date).toBe("2026-09-23");
    expect(at("today", { timezone: "UTC", now: lateUtc })?.date).toBe("2026-09-22");
  });

  it("tonight is today's evening window, not a guessed time", () => {
    expect(at("tonight")).toMatchObject({ date: "2026-09-23", precision: "part_of_day", window: { from: "18:00", to: "23:00" } });
  });

  it("this Friday and next Friday are different days", () => {
    expect(at("friday")?.date).toBe("2026-09-25");
    expect(at("this friday")?.date).toBe("2026-09-25");
    expect(at("on fri")?.date).toBe("2026-09-25");
    expect(at("next friday")?.date).toBe("2026-10-02");
    expect(at("next monday")?.date).toBe("2026-09-28");
  });

  it("a weekday that is today means today; next week's is a week on", () => {
    expect(at("wednesday")?.date).toBe("2026-09-23");
    expect(at("next wednesday")?.date).toBe("2026-09-30");
    expect(at("tuesday")?.date).toBe("2026-09-29");
  });

  it("this weekend, next week and this week are ranges", () => {
    expect(at("this weekend")).toMatchObject({ precision: "range", date: "2026-09-26", endDate: "2026-09-27" });
    expect(at("next weekend")).toMatchObject({ date: "2026-10-03", endDate: "2026-10-04" });
    expect(at("next week")).toMatchObject({ precision: "range", date: "2026-09-28", endDate: "2026-10-04" });
    expect(at("this week")).toMatchObject({ date: "2026-09-23", endDate: "2026-09-27" });
  });

  it("this weekend, said on a Sunday, is today", () => {
    const sunday = { timezone: "Asia/Kolkata", now: new Date("2026-09-27T05:00:00Z") };
    expect(at("this weekend", sunday)).toMatchObject({ date: "2026-09-27", endDate: "2026-09-27" });
  });

  it("after school and before dinner are windows, on today or on the day named", () => {
    expect(at("after school")).toMatchObject({ date: "2026-09-23", precision: "part_of_day", window: { from: "15:30", to: "18:00" } });
    expect(at("tomorrow after school")).toMatchObject({ date: "2026-09-24", window: { from: "15:30", to: "18:00" } });
    expect(at("before dinner")).toMatchObject({ window: { from: "17:00", to: "19:00" } });
    expect(at("friday evening")).toMatchObject({ date: "2026-09-25", window: { from: "17:00", to: "21:00" } });
    expect(at("this morning")).toMatchObject({ date: "2026-09-23", window: { from: "06:00", to: "12:00" } });
  });

  it("an explicit date is taken as said; without a year, a passed date means next year's", () => {
    expect(at("2026-10-02")?.date).toBe("2026-10-02");
    expect(at("2 oct")?.date).toBe("2026-10-02");
    expect(at("october 2nd")?.date).toBe("2026-10-02");
    expect(at("5 january")?.date).toBe("2027-01-05");
    expect(at("31 feb")).toBeNull();
  });

  it("anything it cannot pin down is null, so the caller asks rather than guesses", () => {
    expect(at("sometime soon")).toBeNull();
    expect(at("whenever")).toBeNull();
    expect(at("next week after school")).toBeNull();
  });

  it("resolveDay refuses a range: an absence or appointment needs one day", () => {
    expect(resolveDay("next week", WED)).toBeNull();
    expect(resolveDay("tomorrow after school", WED)).toBe("2026-09-24");
    expect(resolveDay("next friday", WED)).toBe("2026-10-02");
  });
});
