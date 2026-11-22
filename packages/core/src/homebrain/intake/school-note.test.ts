import { describe, expect, it } from "vitest";

import { handedBackText } from "../../hometalk/intake-questions";
import { addedReply } from "../../whatsapp/intake";
import { isUndatedSchoolNotice, noteSummary } from "./school-note";

describe("a school notice with nothing dated becomes a school note at once (2026-11-21)", () => {
  it("is a notice only when nothing in it has a date", () => {
    expect(isUndatedSchoolNotice({ classifiedKind: "school_item", extracted: { title: "New uniform rule", dueDate: null, dateText: null } })).toBe(true);
    expect(isUndatedSchoolNotice({ classifiedKind: "school_item", extracted: { title: "PTM", dueDate: null, dateText: "Saturday" } })).toBe(false);
    expect(isUndatedSchoolNotice({ classifiedKind: "school_item", extracted: { title: "PTM", dueDate: "2026-12-05" } })).toBe(false);
    expect(isUndatedSchoolNotice({ classifiedKind: "school_item", extracted: { title: "Exams", schedule: { kind: "exam" } } })).toBe(false);
    expect(isUndatedSchoolNotice({ classifiedKind: "school_item", extracted: { title: "Circular" }, understanding: { document: { records: [{ record: { dueDate: "2026-12-05" } }] } } })).toBe(false);
    expect(isUndatedSchoolNotice({ classifiedKind: "event", extracted: { title: "Party" } })).toBe(false);
    expect(isUndatedSchoolNotice({ classifiedKind: "school_item", extracted: null })).toBe(false);
  });

  it("says what it kept, in one line, with no number, and where to see or restore it", () => {
    const reply = addedReply({ title: "Uniform circular", where: "Notes", kind: "school_item", note: { summary: "From Monday, Class 3 wears the sports uniform on Wednesdays." } });
    expect(reply).toMatch(/^📝 Kept \*Uniform circular\* as a school note: .+\. Nothing in it has a date, so nothing went on the calendar\. See it or restore it in HomeSend: https:\/\/\S+\/home-send$/);
    expect(reply.replace(/https:\/\/\S+/, "")).not.toMatch(/\d/);
    expect(handedBackText("Got it.", { added: { title: "Uniform circular", where: "Notes", note: { summary: "Sports uniform on Wednesdays." } }, stillNeeded: [] })).toBe(
      "Got it. 📝 Kept **Uniform circular** as a school note: Sports uniform on Wednesdays. Nothing in it has a date, so nothing went on the calendar. See it or restore it in HomeSend.",
    );
  });

  it("keeps the summary to one short line", () => {
    expect(noteSummary("  a\n\nb  ", null)).toBe("a b");
    expect(noteSummary(null, "Title")).toBe("Title");
    expect(noteSummary("x".repeat(300), null)).toHaveLength(158);
  });
});
