import { describe, expect, it } from "vitest";

import { EXAM_TIMETABLE_STD_3_7, STD_IV_PAPERS } from "../evaluation/homesend-documents/exam-timetable";
import { classOf, columnFor, examTypeOf, planTimetable, rowDate } from "./timetable";

const ASMI = { memberId: "m-asmi", name: "Asmi", grade: "4", school: "Podar Innovation Centre" };

describe("a timetable with a column per class becomes each child's exam days (2026-11-21)", () => {
  it("reads every way a class is written as the same class", () => {
    for (const label of ["Std. IV", "Std IV", "Grade 4", "Class IV", "4th", "IV", "4", "Standard 4", "class iv"]) expect(classOf(label).grade).toBe(4);
    expect(classOf("Class V-B")).toEqual({ grade: 5, section: "B" });
    expect(classOf("Hindi/French").grade).toBeNull();
  });

  it("picks the child's own column, and only when exactly one fits", () => {
    expect(columnFor(EXAM_TIMETABLE_STD_3_7.columns, "Grade 4")).toBe(1);
    expect(columnFor(EXAM_TIMETABLE_STD_3_7.columns, "IX")).toBeNull();
    expect(columnFor(["Class 5-A", "Class 5-B"], "5")).toBeNull();
    expect(columnFor(["Class 5-A", "Class 5-B"], "5B")).toBe(1);
  });

  it("the owner's timetable: Asmi in Std IV gets her 8 exam days, 3 to 14 Dec, none on a weekend", () => {
    const plan = planTimetable(EXAM_TIMETABLE_STD_3_7, [ASMI]);
    expect(plan.examType).toBe("Mid-term");
    expect(plan.title).toBe("Mid-Term Unit Test 2");
    expect(plan.needClass).toEqual([]);
    expect(plan.children).toEqual([{ memberId: "m-asmi", name: "Asmi", column: "Std. IV", papers: STD_IV_PAPERS }]);
  });

  it("two children at the school each get their own column; one not in the table gets nothing", () => {
    const plan = planTimetable(EXAM_TIMETABLE_STD_3_7, [ASMI, { memberId: "m-kabir", name: "Kabir", grade: "Std VII", school: "Podar" }, { memberId: "m-tara", name: "Tara", grade: "1", school: "Podar" }]);
    expect(plan.children.map((child) => [child.name, child.column, child.papers.length])).toEqual([["Asmi", "Std. IV", 8], ["Kabir", "Std. VII", 8]]);
  });

  it("asks for a child at the school whose class isn't on record, never guessing a column", () => {
    const plan = planTimetable(EXAM_TIMETABLE_STD_3_7, [{ ...ASMI, grade: null }]);
    expect(plan.children).toEqual([]);
    expect(plan.needClass).toEqual([{ memberId: "m-asmi", name: "Asmi" }]);
  });

  it("only a child at the named school, when the household has children at two schools", () => {
    const plan = planTimetable(EXAM_TIMETABLE_STD_3_7, [ASMI, { memberId: "m-other", name: "Other", grade: "4", school: "Lakeside High" }]);
    expect(plan.children.map((child) => child.name)).toEqual(["Asmi"]);
  });

  it("never invents a date the table doesn't write", () => {
    expect(rowDate({ dateText: "03-12-26 Thursday", dueDate: null, cells: [] }, null)).toBe("2026-12-03");
    expect(rowDate({ dateText: "3rd December", dueDate: null, cells: [] }, 2026)).toBe("2026-12-03");
    expect(rowDate({ dateText: "Thursday", dueDate: null, cells: [] }, 2026)).toBeNull();
    expect(rowDate({ dateText: "31-02-26", dueDate: null, cells: [] }, null)).toBeNull();
  });

  it("names the exam type from the table's own name", () => {
    expect(examTypeOf("Unit Test 1")).toBe("Unit test");
    expect(examTypeOf("Annual Examination")).toBe("Finals");
  });
});
