import { describe, expect, it } from "vitest";
import { ownRemindersAbout } from "./reconcile";

describe("a person's own reminder about a record stands in for its derived one (2026-11-22)", () => {
  it("keys the reminder's recipient and the record it is about", () => {
    const covered = ownRemindersAbout([
      { recipient_member_id: "kunal", source_type: "reminder", decision_factors: { source: "home_talk", about: { sourceType: "school_item", sourceId: "exam-1" } } },
      // A plain reminder is about nothing.
      { recipient_member_id: "kunal", source_type: "reminder", decision_factors: { source: "home_talk" } },
      // A derived reminder never stands in for another.
      { recipient_member_id: "upasana", source_type: "school_item", decision_factors: { about: { sourceType: "school_item", sourceId: "exam-1" } } },
    ]);
    expect([...covered]).toEqual(["kunal|school_item:exam-1"]);
  });
});
