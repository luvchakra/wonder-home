import { describe, expect, it } from "vitest";

import { activityEntries, type Activity } from "../school/activities";
import { asksWhatIsOn, memberNamedIn, scheduleReply, scheduleSpanOf } from "./answer";
import type { CalendarEntry } from "./projection";

/**
 * "What is happening tomorrow?" answered from the calendar itself (the
 * owner's report, 2026-10-23): the Calendar showed Asmi's parent–teacher
 * meeting, Vocal and Piano on Sat 24 Oct, and HomeTalk named only the
 * meeting.
 */

const TZ = "Asia/Kolkata";
// Fri 23 Oct 2026, 8:28 pm in Kolkata.
const NOW = new Date("2026-10-23T14:58:00Z");

const VIEWER = { memberId: "kunal", isAdmin: true, timeZone: TZ };

function activity(id: string, name: string, startsAt: string, endsAt: string, place: string): Activity {
  return {
    id,
    childMemberId: "asmi",
    name,
    kind: "music",
    description: null,
    teacherName: null,
    teacherContact: null,
    place: { name: place, placeId: null, address: null, location: null },
    days: [6],
    startsAt,
    endsAt,
    startsOn: null,
    endsOn: null,
    notes: null,
    items: [],
  };
}

const MEETING: CalendarEntry = {
  id: "school:ptm",
  source: "school",
  sourceId: "ptm",
  title: "Grade 5 PT1 Parent Teacher Meeting",
  detail: null,
  start: new Date("2026-10-24T03:00:00Z"),
  end: new Date("2026-10-24T04:00:00Z"),
  allDay: false,
  timeZone: TZ,
  kind: "block",
  category: "school",
  memberIds: ["asmi"],
  ownerMemberId: null,
  status: "confirmed",
  visibility: "household",
  occurrenceDate: null,
  repeats: false,
  protected: false,
  href: "/school",
  can: { edit: false },
};

const NAMES = new Map([
  ["asmi", "Asmi"],
  ["kunal", "Kunal"],
]);

describe("which questions ask what is on", () => {
  it.each(["what is happening tomorrow", "what is Asmi doing on Monday", "What's on this weekend?", "anything planned for Saturday?", "what's our schedule next week", "do we have any events today"])("%s", (utterance) => {
    expect(asksWhatIsOn(utterance)).toBe(true);
  });

  it.each(["is Asmi free tomorrow?", "what does Asmi have tomorrow", "which bills are due tomorrow", "what's for dinner tomorrow", "who is coming to the party on Saturday?", "add milk to the list"])("not %s", (utterance) => {
    expect(asksWhatIsOn(utterance)).toBe(false);
  });
});

describe("the days a question names", () => {
  it("reads tomorrow from the words when the understanding left it out", () => {
    expect(scheduleSpanOf(undefined, "what is happening tomorrow", { timezone: TZ, now: NOW })).toMatchObject({ from: "2026-10-24", to: "2026-10-24", window: null });
  });

  it("takes a week but not a month", () => {
    const week = scheduleSpanOf("next week", "what's on next week", { timezone: TZ, now: NOW });
    expect(week && week.from < week.to).toBe(true);
    expect(scheduleSpanOf("december", "what's on in december", { timezone: TZ, now: NOW })).toBeNull();
  });

  it("keeps a part of the day", () => {
    expect(scheduleSpanOf("tomorrow evening", "what's on tomorrow evening", { timezone: TZ, now: NOW })?.window).toEqual({ from: "17:00", to: "21:00" });
  });
});

describe("the answer", () => {
  const span = scheduleSpanOf("tomorrow", "what is happening tomorrow", { timezone: TZ, now: NOW })!;
  const classes = activityEntries([activity("vocal", "Vocal", "10:00", "11:00", "Solus building"), activity("piano", "Piano", "18:00", "19:00", "Club Splendora")], VIEWER, span);

  it("names everything the Calendar shows for the day, in time order", () => {
    const text = scheduleReply({ span, entries: [...classes, MEETING], failedSources: [], timeZone: TZ, names: NAMES });
    expect(text).toContain("tomorrow (Sat 24 Oct)");
    const order = ["Grade 5 PT1 Parent Teacher Meeting", "Vocal", "Piano"].map((title) => text.indexOf(`**${title}**`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).toContain("8:30 am – 9:30 am — **Grade 5 PT1 Parent Teacher Meeting** (Asmi)");
    expect(text).toContain("10:00 am – 11:00 am — **Vocal** (Asmi) · Solus building");
    expect(text).toContain("6:00 pm – 7:00 pm — **Piano** (Asmi) · Club Splendora");
  });

  it("keeps to the evening when that is what was asked", () => {
    const evening = scheduleSpanOf("tomorrow evening", "what's on tomorrow evening", { timezone: TZ, now: NOW })!;
    const text = scheduleReply({ span: evening, entries: [...classes, MEETING], failedSources: [], timeZone: TZ, names: NAMES });
    expect(text).toContain("Piano");
    expect(text).not.toContain("Vocal");
  });

  it("keeps to the person named", () => {
    expect(memberNamedIn("what is Asmi doing tomorrow", [...NAMES].map(([id, firstName]) => ({ id, firstName })))).toBe("asmi");
    const text = scheduleReply({ span, entries: [...classes, MEETING], failedSources: [], timeZone: TZ, names: NAMES, forMemberId: "kunal" });
    expect(text).toBe("Nothing is on the calendar for Kunal tomorrow (Sat 24 Oct).");
  });

  it("says when part of the calendar could not be read", () => {
    const text = scheduleReply({ span, entries: [], failedSources: ["activity"], timeZone: TZ, names: NAMES });
    expect(text).toContain("could not be read");
  });
});
