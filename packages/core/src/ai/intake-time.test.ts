import { describe, expect, it } from "vitest";

import { groundIntakeDate, sanitizeIntakeExtraction, timeFromDateText, type IntakeExtraction } from "./classify-intake";
import { BLANK_READING } from "../evaluation/runners";

/**
 * Story 14-014: HomeSend keeps the time a notice gives, not just its day.
 * The model only copies the phrase; this code decides the time, and only
 * what is unmistakably a clock time counts.
 */

const reference = { now: new Date("2026-09-23T06:00:00Z"), timezone: "Asia/Kolkata" };
const reading = (over: Partial<IntakeExtraction>): IntakeExtraction => ({ ...BLANK_READING, ...over });

describe("timeFromDateText", () => {
  it.each([
    ["Saturday 26 September at 9:00 am", "09:00", null],
    ["at 9am", "09:00", null],
    ["9.30am", "09:30", null],
    ["9:00 a.m. – 11:30 a.m.", "09:00", "11:30"],
    ["9–11am", "09:00", "11:00"],
    ["11-1pm", "11:00", "13:00"],
    ["9am-11", "09:00", "11:00"],
    ["from 2 to 4 pm", "14:00", "16:00"],
    ["between 2 and 4pm", "14:00", "16:00"],
    ["5 Oct 2026 from 10.30am to 12.30pm", "10:30", "12:30"],
    ["tomorrow 14:30", "14:30", null],
    ["noon on Friday", "12:00", null],
    ["12pm", "12:00", null],
    ["12am", "00:00", null],
  ])("%s → %s–%s", (text, start, end) => {
    expect(timeFromDateText(text)).toEqual({ start, end });
  });

  it("never reads a day of the month, a year or a numeric date as a time", () => {
    for (const text of ["26 September", "27/09", "Monday 5 October, 2026", "26 and 27 September", "2026-09-26", "at 9", "9.30", "25"]) {
      expect(timeFromDateText(text), text).toBeNull();
    }
  });

  it("an end that is not after the start keeps only the start", () => {
    expect(timeFromDateText("3pm to 1pm")).toEqual({ start: "15:00", end: null });
  });
});

describe("groundIntakeDate reads the time of a school item", () => {
  it("the test spec's live phrase keeps its time (23 Sep 2026)", () => {
    const grounded = groundIntakeDate(reading({ kind: "school_item", title: "Sports Day", dateText: "Saturday 26 September at 9:00 am" }), reference);
    expect(grounded).toMatchObject({ dueDate: "2026-09-26", dueTime: "09:00", endTime: null });
  });

  it("keeps a start and an end", () => {
    const grounded = groundIntakeDate(reading({ kind: "school_item", title: "PTM", dateText: "Friday 9–11am" }), reference);
    expect(grounded).toMatchObject({ dueDate: "2026-09-25", dueTime: "09:00", endTime: "11:00" });
  });

  it("a day with no time stays all-day", () => {
    expect(groundIntakeDate(reading({ kind: "school_item", title: "Worksheet", dateText: "tomorrow" }), reference)).toMatchObject({ dueDate: "2026-09-24", dueTime: null });
  });

  it("a time on its own never invents a day", () => {
    const grounded = groundIntakeDate(reading({ kind: "school_item", title: "Assembly", dateText: "at 9am" }), reference);
    expect(grounded.dueDate).toBeNull();
    expect(grounded.dueTime).toBeNull();
  });

  it("a day nobody can decide keeps no time either", () => {
    // 26 September 2026 is a Saturday, not a Friday.
    const grounded = groundIntakeDate(reading({ kind: "school_item", title: "Sports Day", dateText: "Friday, 26 September at 9am" }), reference);
    expect(grounded.dueDate).toBeNull();
    expect(grounded.dueTime).toBeNull();
  });

  it("an older notice's weekday says which year its date was, and the time comes with it", () => {
    // Sent on 23 Oct 2026: 22 September 2026 is a Tuesday; 22 September 2027, a Wednesday.
    const october = { timezone: "Asia/Kolkata", now: new Date("2026-10-23T21:03:00Z") };
    const grounded = groundIntakeDate(reading({ kind: "school_item", title: "SOF IGKO Examination", dateText: "Tuesday 22nd September, 2:30 p.m. – 3:30 p.m." }), october);
    expect(grounded).toMatchObject({ dueDate: "2026-09-22", dueTime: "14:30", endTime: "15:30" });
    // A weekday that fits neither year still decides nothing.
    expect(groundIntakeDate(reading({ kind: "school_item", title: "Exam", dateText: "Friday 22nd September at 2pm" }), october)).toMatchObject({ dueDate: null, dueTime: null });
    // A written year is never second-guessed.
    expect(groundIntakeDate(reading({ kind: "school_item", title: "Exam", dateText: "Tuesday 22 September 2027" }), october).dueDate).toBeNull();
  });

  it("reads a time the way people write it: morning, afternoon, night, hrs, noon", () => {
    const at = (dateText: string) => groundIntakeDate(reading({ kind: "school_item", title: "Exam", dateText: `Saturday, ${dateText}` }), reference);
    expect(at("9.30 morning")).toMatchObject({ dueTime: "09:30" });
    expect(at("4 in the afternoon")).toMatchObject({ dueTime: "16:00" });
    expect(at("7 at night")).toMatchObject({ dueTime: "19:00" });
    expect(at("14.30 hrs")).toMatchObject({ dueTime: "14:30" });
    expect(at("10 am to 12 noon")).toMatchObject({ dueTime: "10:00", endTime: "12:00" });
  });

  it("reads a numeric date day first, and never a time as a date", () => {
    const october = { timezone: "Asia/Kolkata", now: new Date("2026-10-23T09:00:00Z") };
    const day = (dateText: string) => groundIntakeDate(reading({ kind: "school_item", title: "Quiz", dateText }), october).dueDate;
    expect(day("Sat 31/10 at 9 am")).toBe("2026-10-31");
    expect(day("22-09-2026")).toBe("2026-09-22");
    expect(day("02/11")).toBe("2026-11-02");
    expect(day("3-4 pm")).toBeNull();
  });

  it("a day and month with no year is the nearest one to when it was sent", () => {
    const october = { timezone: "Asia/Kolkata", now: new Date("2026-10-23T09:00:00Z") };
    const day = (dateText: string) => groundIntakeDate(reading({ kind: "school_item", title: "PTM", dateText }), october).dueDate;
    expect(day("22nd September")).toBe("2026-09-22");
    expect(day("15th January")).toBe("2027-01-15");
  });

  it("keeps the model's own full date and still reads the time", () => {
    const grounded = groundIntakeDate(reading({ kind: "school_item", title: "Exam", dueDate: "2026-10-12", dateText: "the second Monday of next month, 10am" }), reference);
    expect(grounded).toMatchObject({ dueDate: "2026-10-12", dueTime: "10:00" });
  });

  it("a bill is due on a day, and a health document is dated: neither keeps a time", () => {
    expect(groundIntakeDate(reading({ kind: "bill", title: "Rent", dateText: "5 October by 5pm" }), reference)).toMatchObject({ dueDate: "2026-10-05", dueTime: null });
    expect(groundIntakeDate(reading({ kind: "health_document", title: "Dentist", dateText: "27 September at 4pm" }), reference)).toMatchObject({ documentDate: "2026-09-27", dueTime: null });
  });

  it("a time is never a model's to set", () => {
    const smuggled = { ...reading({ readable: true, kind: "school_item", title: "Sports Day", dueDate: "2026-09-26" }), dueTime: "03:00", endTime: "04:00" };
    expect(sanitizeIntakeExtraction(smuggled)).toMatchObject({ dueTime: null, endTime: null });
  });
});
