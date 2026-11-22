import { describe, expect, it } from "vitest";

import { acceptReading, isClassifyFailure, repairSchedule, type IntakeExtraction } from "../ai/classify-intake";
import { DOCUMENT_CASES } from "../evaluation/homesend-documents/cases";
import { BLANK_DOCUMENT_READING, DOCUMENT_CONTEXT } from "../evaluation/homesend-documents/check";
import { addedReply, acknowledgementFor } from "../whatsapp/intake";
import { CLASS_OPEN, endingFor, type EndingInput } from "./deadlines";
import { twinOf } from "./repository";
import { isUndatedSchoolNotice, looksLikeTimetable } from "../homebrain/intake/school-note";
import { planTimetable } from "../homebrain/school/timetable";

/**
 * The owner's timetable photo, 20–21 Nov: the first read came back empty (no model), he sent the photo again and
 * that copy was added, then the first copy was read late. Each step, with the synthetic timetable's reading (HD-01).
 */
const HD01 = DOCUMENT_CASES.find((doc) => doc.id === "HD-01")!;
const schedule = HD01.reading.schedule as NonNullable<IntakeExtraction["schedule"]>;

describe("a timetable read late, after the same photo was sent again (21 Nov)", () => {
  it("a schedule's small slips are mended, never the reason the timetable is lost", () => {
    const slipped = { ...schedule, columns: ["", ...schedule.columns.slice(1)], rows: schedule.rows.map((row) => ({ ...row, dueDate: "3 Dec" })) };
    const read = acceptReading({ ...BLANK_DOCUMENT_READING, ...HD01.reading, schedule: slipped }, DOCUMENT_CONTEXT);
    expect(isClassifyFailure(read)).toBe(false);
    expect((read as IntakeExtraction).schedule?.columns[0]).toBe("Column 1");
    expect((read as IntakeExtraction).schedule?.rows.every((row) => row.dueDate === null)).toBe(true);
    // The days still come from each row's own written date.
    const plan = planTimetable((read as IntakeExtraction).schedule!, HD01.children ?? []);
    expect(plan.children[0]?.papers.length).toBeGreaterThan(0);
  });

  it("a schedule that can't be mended is dropped, and the rest of the reading kept", () => {
    const read = acceptReading({ ...BLANK_DOCUMENT_READING, ...HD01.reading, schedule: { kind: "timetable", columns: [], rows: [] } }, DOCUMENT_CONTEXT);
    expect(isClassifyFailure(read)).toBe(false);
    expect((read as IntakeExtraction).schedule ?? null).toBeNull();
    expect((read as IntakeExtraction).title).toBe("Mid-Term Unit Test 2 timetable");
    expect(repairSchedule(null)).toBeNull();
  });

  it("a timetable whose table wasn't read says so plainly, is never filed as a note, and never says 'kept'", () => {
    const extracted = { title: "Mid-Term Unit Test 2 timetable", dueDate: null, dateText: null, schedule: null };
    expect(looksLikeTimetable(extracted)).toBe(true);
    expect(isUndatedSchoolNotice({ classifiedKind: "school_item", extracted })).toBe(false);
    const outcome = { duplicate: false, state: "needs_review", itemId: "i-a", notice: "", item: { id: "i-a", classifiedKind: "school_item", extracted, understanding: null } } as never;
    const text = acknowledgementFor(outcome).text;
    expect(text).toContain("I couldn't read the table's class columns, so no exam days were added");
    expect(text).not.toMatch(/kept it|undo anything/);
  });

  it("the late read finds the copy already added, by the same content or the same title, and adds nothing twice", () => {
    const added = { id: "i-b", contentHash: "other-bytes", classifiedKind: "school_item", title: "Mid-Term Unit Test 2 timetable", routedTable: "school_items" };
    expect(twinOf({ id: "i-a", contentHash: "first-bytes", classifiedKind: "school_item", title: "Mid-term unit test 2 Timetable" }, [added])).toEqual({ id: "i-b", title: added.title, routedTable: "school_items" });
    expect(twinOf({ id: "i-a", contentHash: "other-bytes", classifiedKind: "school_item", title: null }, [added])?.id).toBe("i-b");
    expect(twinOf({ id: "i-a", contentHash: "x", classifiedKind: "school_item", title: "Sports Day" }, [added])).toBeNull();
    expect(twinOf({ id: "i-b", contentHash: "other-bytes", classifiedKind: "school_item", title: added.title }, [added])).toBeNull();
    expect(addedReply({ title: added.title, where: "Kids & School", kind: "school_item", already: true })).toMatch(
      /^✅ That's already in Kids & School: \*Mid-Term Unit Test 2 timetable\*\. I didn't add it twice\. See it here: https:\/\/\S+\/school$/,
    );
  });

  it("a timetable waiting on 'Which class is <child> in?' is not filed as a note under the open question", () => {
    const waiting: EndingInput = { status: "classified", kind: "school_item", readable: true, failureReason: null, rawText: null, retryCount: 0, retryRequestedAt: null, canReadAgain: true, senderMemberId: "m-1", asked: new Set(["homesend_class", CLASS_OPEN]), minutesSinceTouched: 600 };
    expect(endingFor(waiting)).toEqual({ action: "wait" });
    // Answered "Keep it as a note" (or its default): ended as a note on the next pass.
    expect(endingFor({ ...waiting, asked: new Set(["homesend_class"]) })).toEqual({ action: "note" });
  });
});
