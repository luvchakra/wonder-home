import { describe, expect, it } from "vitest";

import { CALENDAR_SOURCES } from "../calendar/projection";
import type { HouseholdMember } from "../identity/households";
import type { Activity } from "../school/activities";
import { ACTIVITY_SESSION_DAYS, buildContextItems, CALENDAR_SOURCE_RECORDS } from "./builders";

/**
 * HomeTalk and the Calendar read the same household (the owner's report,
 * 2026-10-23: "what is happening tomorrow" left out Asmi's Vocal and Piano
 * classes the Calendar showed for the day).
 */

const TZ = "Asia/Kolkata";
// Fri 23 Oct 2026, 8:28 pm in Kolkata.
const NOW = new Date("2026-10-23T14:58:00Z");

const ASMI: HouseholdMember = {
  id: "asmi",
  displayName: "Asmi Chakraborty",
  memberType: "child",
  status: "active",
  roles: [],
  isOwner: false,
  dateOfBirth: "2015-04-10",
  nickname: null,
  relationship: "Daughter",
  occupation: null,
  schoolOrWorkLocation: null,
  specialOccasionLabel: null,
  specialOccasionDate: null,
  gender: null,
  notes: null,
  avatarUrl: null,
};

function activity(id: string, name: string, days: number[], startsAt: string, endsAt: string, place: string, extra: Partial<Activity> = {}): Activity {
  return {
    id,
    childMemberId: "asmi",
    name,
    kind: "music",
    description: null,
    teacherName: null,
    teacherContact: null,
    place: { name: place, placeId: null, address: null, location: null },
    days,
    startsAt,
    endsAt,
    startsOn: null,
    endsOn: null,
    notes: null,
    items: [],
    ...extra,
  };
}

const build = (activities: Activity[]) =>
  buildContextItems({ members: [ASMI], activities }, { householdId: "hh", householdName: "Chakraborty Home", timezone: TZ, now: NOW, viewerMemberId: "asmi", limitLists: false });

describe("every calendar source is something HomeBrain reads", () => {
  it("maps each source the Calendar shows to HomeBrain records", () => {
    for (const source of CALENDAR_SOURCES) expect(CALENDAR_SOURCE_RECORDS[source].length, source).toBeGreaterThan(0);
  });
});

describe("a child's classes outside school are HomeBrain facts", () => {
  const items = build([
    activity("vocal", "Vocal", [6], "10:00", "11:00", "Solus building"),
    activity("piano", "Piano", [6], "18:00", "19:00", "Club Splendora", {
      items: [{ id: "comp", activityId: "piano", kind: "competition", title: "Junior recital", onDate: "2026-11-07", startsAt: null, endsAt: null, detail: null, result: null }],
    }),
  ]);

  it("says what each class is and when it meets", () => {
    const vocal = items.find((item) => item.entityType === "activity" && item.entityId === "vocal");
    expect(vocal?.summary).toBe("Asmi Chakraborty has Vocal (music) on Saturdays 10:00am to 11:00am at Solus building.");
  });

  it("puts tomorrow's sessions on tomorrow, as the Calendar does", () => {
    const tomorrow = items.filter((item) => item.entityType === "activity_session" && item.attributes.date === "2026-10-24");
    expect(tomorrow.map((item) => item.attributes.title).sort()).toEqual(["Piano", "Vocal"]);
    expect(tomorrow.every((item) => item.subjectMemberIds.includes("asmi") && item.privacyClass === "child")).toBe(true);
  });

  it("keeps sessions to the fortnight ahead", () => {
    const sessions = items.filter((item) => item.entityType === "activity_session" && item.entityId.startsWith("vocal:"));
    expect(sessions.map((item) => item.attributes.date)).toEqual(["2026-10-24", "2026-10-31"]);
    expect(ACTIVITY_SESSION_DAYS).toBe(14);
  });

  it("names an upcoming competition on its day", () => {
    const competition = items.find((item) => item.entityType === "activity_note");
    expect(competition?.attributes.date).toBe("2026-11-07");
    expect(competition?.summary).toContain("Junior recital");
  });

  it("leaves a class with no fixed days without sessions", () => {
    const loose = build([activity("art", "Art", [], "16:00", "17:00", "Studio")]);
    expect(loose.some((item) => item.entityType === "activity_session")).toBe(false);
    expect(loose.find((item) => item.entityType === "activity")?.summary).toContain("no fixed days");
  });
});
