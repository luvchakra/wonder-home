import { describe, expect, it } from "vitest";

import { patchFor } from "./entry-corrections";

const people = [
  { id: "kabir", displayName: "Kabir", memberType: "child" as const },
  { id: "meera", displayName: "Meera", memberType: "child" as const },
  { id: "asha", displayName: "Asha", memberType: "adult" as const, nickname: "Mum" },
];
const context = { timezone: "Asia/Kolkata", now: new Date("2026-11-14T06:30:00Z") };

describe("plain corrections of a recent HomeSend entry (the owner, 2026-11-14)", () => {
  it("a new day for a bill, a school notice or a health document", () => {
    expect(patchFor({ field: "date", text: "12 Dec" }, "bill", people, context)).toEqual({ dueDate: "2026-12-12" });
    expect(patchFor({ field: "date", text: "12 Dec" }, "school_item", people, context)).toEqual({ dueDate: "2026-12-12" });
    expect(patchFor({ field: "date", text: "12 Dec" }, "health_document", people, context)).toEqual({ documentDate: "2026-12-12" });
  });

  it("who a school notice is for, only when exactly one person has that name", () => {
    expect(patchFor({ field: "person", to: "Kabir", from: "Meera" }, "school_item", people, context)).toEqual({ subjectMemberId: "kabir", subjectMemberName: "Kabir" });
    expect(patchFor({ field: "person", to: "Rohan", from: null }, "school_item", people, context)).toBeNull();
    // A bill isn't filed under a child.
    expect(patchFor({ field: "person", to: "Kabir", from: null }, "bill", people, context)).toBeNull();
  });

  it("an amount only for a bill", () => {
    expect(patchFor({ field: "amount", text: "1,240" }, "bill", people, context)).toEqual({ amount: 1240 });
    expect(patchFor({ field: "amount", text: "1,240" }, "school_item", people, context)).toBeNull();
  });
});
