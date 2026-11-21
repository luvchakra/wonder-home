import { describe, expect, it } from "vitest";

import { examKey, matchExam, maxMarksOf, paperFor, type ExamCandidate } from "./exam-match";

const PAPERS = ["Science", "Humanities", "Mathematics", "English", "Computing Theory", "French", "Hindi", "Marathi"].map((subject, index) => ({
  id: `p${index}`,
  subject,
  onDate: `2026-12-${String(3 + index).padStart(2, "0")}`,
}));
const asmi = { memberId: "asmi", name: "Asmi", grade: "5", school: "PODAR Innovation Centre, Cambridge Schools" };
const brother = { memberId: "ved", name: "Ved", grade: "3", school: "PODAR Innovation Centre, Cambridge Schools" };
const mtut2 = (id: string, childMemberId: string): ExamCandidate => ({ id, childMemberId, examType: "Mid-term", title: "Mid-Term Unit Test 2", papers: PAPERS });
const SYLLABUS = { title: "Mid Term Unit Test 2 -2026-27 / Grade 5: Syllabus", school: "PODAR INTERNATIONAL SCHOOL (CAMBRIDGE)", grade: "Grade 5" };

describe("examKey", () => {
  it("reads one exam name however it is written", () => {
    for (const name of ["Mid-Term Unit Test 2", "Mid Term Unit Test 2 -2026-27 / Grade 5: Syllabus", "MTUT2", "MTUT 2 Timetable", "Mid term unit test II"]) {
      expect(examKey(name)).toBe("mtut2");
    }
    expect(examKey("Unit Test 1")).not.toBe(examKey("Unit Test 2"));
    expect(examKey("Std. V Half Yearly Examination 2026")).toBe("hy");
  });
});

describe("matchExam", () => {
  it("finds Asmi's Mid-Term Unit Test 2 from the Grade 5 syllabus, with its evidence", () => {
    const found = matchExam(SYLLABUS, [mtut2("e1", "asmi"), mtut2("e2", "ved")], [asmi, brother], "2026-11-21");
    expect(found.kind).toBe("match");
    if (found.kind !== "match") return;
    expect(found.exams.map((fit) => fit.exam.id)).toEqual(["e1"]);
    expect(found.exams[0]!.evidence.map((item) => item.kind)).toEqual(["name", "class", "school", "window"]);
  });

  it("never updates a child of another grade", () => {
    expect(matchExam({ ...SYLLABUS, grade: "Grade 6" }, [mtut2("e1", "asmi")], [asmi], "2026-11-21").kind).toBe("none");
  });

  it("asks when two exams of one child both fit", () => {
    expect(matchExam(SYLLABUS, [mtut2("e1", "asmi"), mtut2("e3", "asmi")], [asmi], "2026-11-21").kind).toBe("ambiguous");
  });

  it("leaves last year's exam alone", () => {
    expect(matchExam(SYLLABUS, [mtut2("e1", "asmi")], [asmi], "2027-06-01").kind).toBe("none");
  });

  it("never matches another school", () => {
    expect(matchExam({ ...SYLLABUS, school: "Delhi Public School" }, [mtut2("e1", "asmi")], [asmi], "2026-11-21").kind).toBe("none");
  });
});

describe("paperFor", () => {
  it("matches tolerant names and never guesses", () => {
    expect(paperFor("Computing", PAPERS)?.subject).toBe("Computing Theory");
    expect(paperFor("Maths", PAPERS)?.subject).toBe("Mathematics");
    expect(paperFor("ENGLISH", PAPERS)?.subject).toBe("English");
    expect(paperFor("Hindi/French", [PAPERS[6]!])?.subject).toBe("Hindi");
    expect(paperFor("Hindi/French", PAPERS)).toBeNull();
    expect(paperFor("Art", PAPERS)).toBeNull();
  });
});

describe("maxMarksOf", () => {
  it("reads the marks however they are written", () => {
    expect(maxMarksOf("20 Mks")).toBe(20);
    expect(maxMarksOf("MTUT 20")).toBe(20);
    expect(maxMarksOf("20 marks [Project based]")).toBe(20);
    expect(maxMarksOf("—")).toBeNull();
  });
});
