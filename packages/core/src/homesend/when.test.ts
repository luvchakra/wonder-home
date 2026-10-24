import { describe, expect, it } from "vitest";

import { dayFromDateText, findDatePhrase, groundIntakeDate, sanitizeIntakeExtraction, timeFromDateText, type IntakeExtraction } from "../ai/classify-intake";
import { recoverWhen } from "./when";

// Sent on Thursday 22 October 2026, in India.
const at = { timezone: "Asia/Kolkata", now: new Date("2026-10-22T05:00:00Z") };
const day = (text: string) => dayFromDateText(text, at);
const when = (text: string) => {
  const phrase = findDatePhrase(text);
  return phrase ? { day: day(phrase), time: timeFromDateText(phrase) } : null;
};

describe("written dates in every common form", () => {
  it.each([
    ["25th Oct'26", "2026-10-25"],
    ["25th Oct ’26", "2026-10-25"],
    ["Sunday, 25th Oct'26", "2026-10-25"],
    ["25 October 2026", "2026-10-25"],
    ["25 Oct, 2026", "2026-10-25"],
    ["25-Oct-2026", "2026-10-25"],
    ["25-Oct-26", "2026-10-25"],
    ["Oct 25", "2026-10-25"],
    ["Oct. 25th, 2026", "2026-10-25"],
    ["October 25 '26", "2026-10-25"],
    ["25/10/2026", "2026-10-25"],
    ["25/10/26", "2026-10-25"],
    ["25.10.2026", "2026-10-25"],
    ["25-10-2026", "2026-10-25"],
    ["25/10", "2026-10-25"],
    ["the 25th of October", "2026-10-25"],
  ])("%s → %s", (text, iso) => {
    expect(day(text)).toBe(iso);
  });

  it("never takes a range of days for a year", () => {
    expect(day("Oct 25-26")).toBe("2026-10-25");
  });

  it("decides nothing when the weekday and the date disagree", () => {
    expect(day("Saturday, 25th Oct'26")).toBeNull();
  });
});

describe("finding the day and time inside free text", () => {
  it("reads the owner's camp flyer from its notes", () => {
    const notes = "Promotional flyer for Torrent Diagnostics LiveWell packages from ₹799. Caption announces a health check camp on Sunday, 25th Oct'26, 7:30 AM – 1:30 PM at Splendora CHS (Club House).";
    expect(when(notes)).toEqual({ day: "2026-10-25", time: { start: "07:30", end: "13:30" } });
  });

  it.each([
    ["Annual Day on 31/10/2026 from 5 pm to 8 pm", "2026-10-31", { start: "17:00", end: "20:00" }],
    ["Rehearsal 28 Oct at 4pm sharp", "2026-10-28", { start: "16:00", end: null }],
    ["Timings: 9.30 am - 12.30 pm\nDate: 1st November", "2026-11-01", null],
    ["Party this Saturday, 4 to 7 pm", "2026-10-24", { start: "16:00", end: "19:00" }],
    ["PTM tomorrow at 10:00", "2026-10-23", { start: "10:00", end: null }],
    ["Event on 7 Nov, 18:30 hrs", "2026-11-07", { start: "18:30", end: null }],
    ["Sports day 3rd Nov, 8 am onwards", "2026-11-03", { start: "08:00", end: null }],
  ])("%s", (text, iso, time) => {
    expect(when(text)).toEqual({ day: iso, time });
  });

  it("finds nothing where no day is named", () => {
    expect(findDatePhrase("Sugar ₹20, TSH ₹99, CBC ₹99, HbA1c ₹199")).toBeNull();
    expect(findDatePhrase(null)).toBeNull();
  });

  it("does not read prices or quantities as times", () => {
    expect(when("Offer valid on 25 Oct. Sugar ₹20, 2 kg rice")).toEqual({ day: "2026-10-25", time: null });
  });
});

function reading(over: Partial<IntakeExtraction>): IntakeExtraction {
  return {
    readable: true, kind: "unknown", title: null, notes: null, billKind: null, payee: null, amount: null, currency: null,
    dueDate: null, schoolKind: null, subject: null, quantity: null, unit: null, category: null, healthRecordType: null,
    documentDate: null, dateText: null, merchant: null, lines: [], subjectMemberName: null, summary: null, people: [],
    facts: [], needs: [], change: "new", confidence: "medium", secondary: null, records: [],
    ...over,
  } as IntakeExtraction;
}

describe("a fresh reading keeps its day whatever kind it was read as", () => {
  it("grounds an event whose model wrote the date only in its notes", () => {
    const grounded = groundIntakeDate(reading({ kind: "event", title: "Health camp", notes: "1. Sunday, 25th Oct'26, 7:30 AM – 1:30 PM" }), at);
    expect(grounded).toMatchObject({ dueDate: "2026-10-25", dueTime: "07:30", endTime: "13:30" });
  });

  it("keeps a grocery's date words, so it can still be moved to an event", () => {
    expect(sanitizeIntakeExtraction(reading({ kind: "grocery_item", title: "Atta 5kg", dateText: "Sunday" })).dateText).toBe("Sunday");
  });

  it("never invents a day for a dated kind with no date words anywhere", () => {
    expect(groundIntakeDate(reading({ kind: "event", title: "Get-together", notes: "1. Bring snacks" }), at).dueDate).toBeNull();
  });
});

describe("recoverWhen", () => {
  const stored = { title: "Blood Test Camp at Splendora CHS", notes: "Health check camp on Sunday, 25th Oct'26, 7:30 AM – 1:30 PM", dueDate: null };

  it("fills a waiting item's day and time from its own words", () => {
    expect(recoverWhen(stored, at)).toMatchObject({ dueDate: "2026-10-25", dueTime: "07:30", endTime: "13:30" });
  });

  it("prefers the date words the model kept", () => {
    expect(recoverWhen({ ...stored, dateText: "Saturday 31 Oct at 9am" }, at)).toMatchObject({ dueDate: "2026-10-31", dueTime: "09:00" });
  });

  it("never overrides a day already there, and does nothing without the household's clock", () => {
    expect(recoverWhen({ ...stored, dueDate: "2026-11-01" }, at).dueDate).toBe("2026-11-01");
    expect(recoverWhen(stored, { timezone: null, now: at.now }).dueDate).toBeNull();
  });
});
