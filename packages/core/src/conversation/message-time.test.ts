import { describe, expect, it } from "vitest";

import { messageDay, messageDayLabel, messageTime } from "./message-time";

const KOLKATA = "Asia/Kolkata";

describe("message times, in the household's own zone", () => {
  it("shows the time as a messaging app does", () => {
    expect(messageTime(new Date("2026-09-07T10:37:00Z"), KOLKATA)).toBe("4:07 PM");
    expect(messageTime(new Date("2026-09-08T05:20:00Z"), KOLKATA)).toBe("10:50 AM");
  });

  it("puts a message on the household's day, not the server's", () => {
    // 20:00 UTC is already the next morning in Kolkata.
    expect(messageDay(new Date("2026-09-07T20:00:00Z"), KOLKATA)).toBe("2026-09-08");
    expect(messageDay(new Date("2026-09-07T20:00:00Z"), "UTC")).toBe("2026-09-07");
  });

  it("says Today, Yesterday, then the full date", () => {
    const now = new Date("2026-09-09T14:30:00Z");
    expect(messageDayLabel(new Date("2026-09-09T02:00:00Z"), KOLKATA, now)).toBe("Today");
    expect(messageDayLabel(new Date("2026-09-08T11:11:00Z"), KOLKATA, now)).toBe("Yesterday");
    expect(messageDayLabel(new Date("2026-09-07T10:37:00Z"), KOLKATA, now)).toBe("September 7, 2026");
  });

  it("counts yesterday across a month and a year boundary", () => {
    expect(messageDayLabel(new Date("2026-08-31T12:00:00Z"), KOLKATA, new Date("2026-09-01T12:00:00Z"))).toBe("Yesterday");
    expect(messageDayLabel(new Date("2026-12-31T12:00:00Z"), KOLKATA, new Date("2027-01-01T12:00:00Z"))).toBe("Yesterday");
  });

  it("treats late evening and early morning in the household's zone as different days", () => {
    const now = new Date("2026-09-09T19:00:00Z"); // 00:30 on the 10th in Kolkata
    expect(messageDayLabel(new Date("2026-09-09T18:00:00Z"), KOLKATA, now)).toBe("Yesterday");
  });

  it("falls back to UTC rather than failing on a zone Intl does not know", () => {
    expect(messageTime(new Date("2026-09-07T10:37:00Z"), "Not/AZone")).toBe("10:37 AM");
  });
});
