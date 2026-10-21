import { describe, expect, it } from "vitest";

import { matchIncoming, sameOccasionName } from "../context/matching";
import type { HouseholdContextItem } from "../context/types";
import { sameEntryOnDay, sameTitledOnDay } from "./duplicates";
import type { CalendarEntry } from "./projection";

const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({
  id: "event:e1", source: "event", sourceId: "e1", title: "Bounce School Trip", detail: "Bounce",
  start: new Date("2026-10-22T02:30:00Z"), end: new Date("2026-10-22T09:30:00Z"), allDay: false, timeZone: "Asia/Kolkata",
  kind: "block", category: "school", memberIds: [], ownerMemberId: null, status: "confirmed", visibility: "household",
  occurrenceDate: null, repeats: false, protected: true, href: null, can: { edit: true }, ...over,
});

describe("the same occasion by another name", () => {
  it("sets aside the words for the kind of outing, and nothing else", () => {
    expect(sameOccasionName("Field trip to Bounce", "Bounce School Trip")).toBe(true);
    expect(sameOccasionName("Zoo picnic", "School trip to the zoo")).toBe(true);
    expect(sameOccasionName("Field trip to Bounce", "Field trip to the Zoo")).toBe(false);
    expect(sameOccasionName("Bounce birthday party", "Bounce School Trip")).toBe(false);
    expect(sameOccasionName("School trip", "Field trip")).toBe(false);
    expect(sameOccasionName("Annual Day rehearsal", "Annual Day")).toBe(false);
  });
});

describe("is it already on the calendar?", () => {
  const calendar = [
    entry({}),
    entry({ id: "holiday:h", source: "holiday", sourceId: "h", title: "Bounce Day", start: new Date("2026-10-22T00:00:00Z") }),
    entry({ id: "event:e2", sourceId: "e2", title: "Swimming", start: new Date("2026-10-23T10:00:00Z") }),
  ];
  const on = (title: string, date = "2026-10-22") => sameEntryOnDay(calendar, { title, date, timeZone: "Asia/Kolkata" })?.sourceId ?? null;

  it("finds the Bounce trip however the school names it, on its day only", () => {
    expect(on("Field trip to Bounce")).toBe("e1");
    expect(on("bounce school trip")).toBe("e1");
    expect(on("Field trip to Bounce", "2026-10-29")).toBeNull();
  });

  it("never calls a different outing, a holiday or another day's entry a copy", () => {
    expect(on("Field trip to the Zoo")).toBeNull();
    expect(on("Swimming")).toBeNull();
    expect(on("Swimming", "2026-10-23")).toBe("e2");
    expect(sameEntryOnDay(calendar, { title: "Bounce School Trip", date: "2026-10-22", timeZone: "Asia/Kolkata", ignoreSourceId: "e1" })).toBeNull();
  });
});

describe("HomeTalk's read of the tables themselves", () => {
  it("reads a school entry with no time on its own day, not the UTC instant it is stored at", () => {
    const rows = [{ sourceId: "s1", title: "Field trip to Bounce", start: new Date("2026-10-22T00:00:00Z"), day: "2026-10-22" }];
    expect(sameTitledOnDay(rows, { title: "Bounce school trip", date: "2026-10-22", timeZone: "America/Los_Angeles" })?.sourceId).toBe("s1");
    expect(sameTitledOnDay(rows, { title: "Bounce school trip", date: "2026-10-21", timeZone: "America/Los_Angeles" })).toBeNull();
  });
});

describe("HomeSend's matcher (the notice that made the second Bounce entry)", () => {
  const event: HouseholdContextItem = {
    id: "calendar:e1", householdId: "h", domain: "calendar", entityType: "event", entityId: "e1", summary: "Bounce School Trip is on 22 Oct.",
    need: "what is on the calendar", privacyClass: "child", subjectMemberIds: ["parent"], tier: 2, aliases: [], freshness: "current",
    attributes: { title: "Bounce School Trip", date: "2026-10-22" }, source: { type: "family_events" },
  } as unknown as HouseholdContextItem;

  it("reads a school notice for the same trip on the same day as a likely duplicate", () => {
    const match = matchIncoming({ domain: "calendar", title: "Field trip to Bounce", subjectMemberId: null, date: "2026-10-22T02:00:00Z", amountMinor: null, attributes: {}, capturedAt: null }, [event], { timezone: "Asia/Kolkata" });
    expect(match.verdict).toBe("likely_duplicate");
  });

  it("still keeps a trip to Bounce on another day apart", () => {
    const match = matchIncoming({ domain: "calendar", title: "Field trip to Bounce", subjectMemberId: null, date: "2026-11-05", amountMinor: null, attributes: {}, capturedAt: null }, [event], { timezone: "Asia/Kolkata" });
    expect(match.verdict === "likely_duplicate" || match.verdict === "exact_match").toBe(false);
  });
});
