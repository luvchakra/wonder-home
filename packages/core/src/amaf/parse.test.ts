import { describe, expect, it } from "vitest";

import { isDontKnow, isSkipQuestion, isStop, isoDate, readAmount, readChoice, readClock, readDate, readEmail, readList, readMonthDay, readPhone, readTimeRange, readWeekdays, readYesNo, stripLeadIn } from "./parse";

describe("AMAF answer readers", () => {
  it("reads dates the way people say them, day first when written with slashes", () => {
    expect(readDate("3 May 2015")).toEqual({ day: 3, month: 5, year: 2015 });
    expect(readDate("May 3rd, 2015")).toEqual({ day: 3, month: 5, year: 2015 });
    expect(readDate("the 3rd of may")).toEqual({ day: 3, month: 5, year: null });
    expect(readDate("03/05/2015")).toEqual({ day: 3, month: 5, year: 2015 });
    expect(readDate("2015-05-03")).toEqual({ day: 3, month: 5, year: 2015 });
    expect(readDate("She was born on 14th Feb, in 2016")).toEqual({ day: 14, month: 2, year: 2016 });
    expect(readDate("31 February 2016")).toBeNull();
    expect(readDate("2016")).toBeNull();
    expect(isoDate({ day: 3, month: 5, year: 2015 })).toBe("2015-05-03");
    expect(isoDate({ day: 3, month: 5, year: null })).toBeNull();
  });

  it("reads clocks and working hours, an end before the start read in the afternoon", () => {
    expect(readClock("9am")).toBe("09:00");
    expect(readClock("5:30 pm".replace(/\s/g, ""))).toBe("17:30");
    expect(readTimeRange("9 to 6")).toEqual({ starts: "09:00", ends: "18:00" });
    expect(readTimeRange("from 8:30 till 3")).toEqual({ starts: "08:30", ends: "15:00" });
    expect(readTimeRange("9am-5:30pm")).toEqual({ starts: "09:00", ends: "17:30" });
    expect(readTimeRange("between 10 and 7")).toEqual({ starts: "10:00", ends: "19:00" });
    expect(readTimeRange("in the morning")).toBeNull();
  });

  it("reads days of the week", () => {
    expect(readWeekdays("Tuesdays and Thursdays")).toEqual([2, 4]);
    expect(readWeekdays("Mon to Fri")).toEqual([1, 2, 3, 4, 5]);
    expect(readWeekdays("weekdays and saturday")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(readWeekdays("every day")).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(readWeekdays("not sure")).toEqual([]);
  });

  it("reads amounts, days of the month, phones and emails", () => {
    expect(readAmount("about ₹2,400")).toBe(2400);
    expect(readAmount("1.5k")).toBe(1500);
    expect(readAmount("nothing")).toBeNull();
    expect(readMonthDay("on the 5th of every month")).toBe(5);
    expect(readMonthDay("due on 12")).toBe(12);
    expect(readPhone("it's +91 98765 43210")).toBe("+919876543210");
    expect(readPhone("123")).toBeNull();
    expect(readEmail("write to Asha.Rao@Example.com please")).toBe("asha.rao@example.com");
  });

  it("picks one option, never two", () => {
    const options = [
      { value: "office", words: ["office", "on site"] },
      { value: "home", words: ["home", "from home", "remote"] },
      { value: "hybrid", words: ["hybrid", "mix", "both"] },
    ] as const;
    expect(readChoice("mostly from home", options)).toBe("home");
    expect(readChoice("hybrid, two days in office", options)).toBeNull();
    expect(readChoice("hybrid", options)).toBe("hybrid");
  });

  it("splits lists and takes lead-ins off", () => {
    expect(readList("peanuts, prawns and kiwi")).toEqual(["peanuts", "prawns", "kiwi"]);
    expect(stripLeadIn("Her name is Mrs Rao.")).toBe("Mrs Rao");
    expect(stripLeadIn("Um, it's Delhi Public School")).toBe("Delhi Public School");
  });

  it("tells moving on, stopping, yes/no and not knowing apart", () => {
    expect(isSkipQuestion("skip")).toBe(true);
    expect(isSkipQuestion("next question")).toBe(true);
    expect(isStop("that's enough for today")).toBe(true);
    expect(isStop("stop asking")).toBe(true);
    expect(isStop("Stop at the shop")).toBe(false);
    expect(readYesNo("yes, that's right")).toBe(true);
    expect(readYesNo("no")).toBe(false);
    expect(readYesNo("maybe")).toBeNull();
    expect(isDontKnow("I don't know")).toBe(true);
    expect(isDontKnow("not sure")).toBe(true);
  });
});
