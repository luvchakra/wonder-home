import { describe, expect, it } from "vitest";

import { dayKind, groupMessages, isChatReaction, nextReaction, tallyReactions, withMyReaction } from "./thread";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 21, 9, minutes)).toISOString();

describe("groupMessages", () => {
  it("groups one person's consecutive messages and breaks on another author", () => {
    const places = groupMessages([
      { authorMemberId: "a", createdAt: at(0), day: "2026-10-21" },
      { authorMemberId: "a", createdAt: at(1), day: "2026-10-21" },
      { authorMemberId: "b", createdAt: at(2), day: "2026-10-21" },
      { authorMemberId: "a", createdAt: at(3), day: "2026-10-21" },
    ]);
    expect(places).toEqual([
      { first: true, last: false, dayStart: true },
      { first: false, last: true, dayStart: false },
      { first: true, last: true, dayStart: false },
      { first: true, last: true, dayStart: false },
    ]);
  });

  it("breaks a run on a new day and after a long pause", () => {
    const places = groupMessages([
      { authorMemberId: "a", createdAt: at(0), day: "2026-10-20" },
      { authorMemberId: "a", createdAt: at(1), day: "2026-10-21" },
      { authorMemberId: "a", createdAt: at(30), day: "2026-10-21" },
    ]);
    expect(places.map((place) => [place.first, place.dayStart])).toEqual([
      [true, true],
      [true, true],
      [true, false],
    ]);
  });

  it("is empty for no messages", () => {
    expect(groupMessages([])).toEqual([]);
  });
});

describe("dayKind", () => {
  it("names today and yesterday, across a month end", () => {
    expect(dayKind("2026-11-01", "2026-11-01")).toBe("today");
    expect(dayKind("2026-10-31", "2026-11-01")).toBe("yesterday");
    expect(dayKind("2026-10-30", "2026-11-01")).toBe("date");
  });
});

describe("reactions", () => {
  it("tallies per emoji in the offered order, with who and whether one is mine", () => {
    const tally = tallyReactions(
      [
        { memberId: "b", emoji: "😂" },
        { memberId: "a", emoji: "👍" },
        { memberId: "c", emoji: "😂" },
        { memberId: "d", emoji: "nope" },
      ],
      "c",
    );
    expect(tally).toEqual([
      { emoji: "👍", count: 1, mine: false, memberIds: ["a"] },
      { emoji: "😂", count: 2, mine: true, memberIds: ["b", "c"] },
    ]);
  });

  it("the same emoji again takes it away, another changes it", () => {
    expect(nextReaction("👍", "👍")).toBeNull();
    expect(nextReaction("👍", "❤️")).toBe("❤️");
    expect(nextReaction(null, "🙏")).toBe("🙏");
  });

  it("applies my reaction optimistically, one per person", () => {
    const before = tallyReactions([{ memberId: "me", emoji: "👍" }, { memberId: "b", emoji: "👍" }], "me");
    expect(withMyReaction(before, "me", "❤️")).toEqual([
      { emoji: "👍", count: 1, mine: false, memberIds: ["b"] },
      { emoji: "❤️", count: 1, mine: true, memberIds: ["me"] },
    ]);
    expect(withMyReaction(before, "me", null)).toEqual([{ emoji: "👍", count: 1, mine: false, memberIds: ["b"] }]);
  });

  it("knows the fixed set", () => {
    expect(isChatReaction("🙏")).toBe(true);
    expect(isChatReaction("🔥")).toBe(false);
  });
});
