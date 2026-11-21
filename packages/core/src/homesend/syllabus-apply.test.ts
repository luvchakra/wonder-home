import { describe, expect, it } from "vitest";

import { en } from "../i18n/messages/en";
import { translator } from "../i18n/translate";
import { asmiMtut2, SYLLABUS_ROWS } from "../evaluation/homesend-documents/syllabus-grade5";
import { notesWithExtras, planSyllabus, studyText, type SyllabusAttached } from "./syllabus-apply";
import { syllabusReply } from "./timetable-words";

const t = translator("en", en);
const exam = asmiMtut2();
const papers = exam.papers.map((paper) => ({ ...paper, examId: exam.id, startsAt: null, endsAt: null, links: [] as string[] }));

const attached = (over: Partial<SyllabusAttached> = {}): SyllabusAttached => ({
  examId: exam.id,
  examName: "Mid-Term Unit Test 2",
  childMemberId: "m-asmi",
  childName: "Asmi",
  grade: "Grade 5",
  updated: ["English", "Hindi", "French", "Marathi", "Mathematics", "Science", "Computing Theory", "Humanities"],
  revised: [],
  unmatched: [],
  unchanged: false,
  checking: false,
  evidence: [],
  ...over,
});

describe("a syllabus updates the exam it is about (2026-11-21)", () => {
  it("puts each subject's words on its paper, exactly as sent, one part per line, with its max marks", () => {
    const plan = planSyllabus({ papers }, { rows: SYLLABUS_ROWS.map((row) => ({ ...row })) });
    const hindi = plan.papers.find((one) => one.paper.subject === "Hindi")!;
    expect(hindi.syllabus).toBe(SYLLABUS_ROWS[1].portion);
    expect(hindi.maxMarks).toBe(20);
    expect(plan.papers.find((one) => one.paper.subject === "Computing Theory")!.syllabus).toContain("3.2 How data travels through networks");
    expect(plan.extras).toEqual([]);
    expect(studyText("  Ch. 6  Fractions \n\n 6.1 Understanding fractions ")).toBe("Ch. 6 Fractions\n6.1 Understanding fractions");
  });

  it("keeps a subject with no paper on the exam's notes, and replaces that block when sent again", () => {
    const once = notesWithExtras("From what was sent to HomeSend: the Std. V column.", [{ subject: "Art", text: "Unit 2 Colour wheel" }]);
    expect(once).toContain("Also in the syllabus (no paper in the timetable):\nArt:\nUnit 2 Colour wheel");
    expect(once!.startsWith("From what was sent to HomeSend: the Std. V column.")).toBe(true);
    expect(notesWithExtras(once, [{ subject: "Art", text: "Unit 2 Colour wheel" }])).toBe(once);
    expect(notesWithExtras(once, [])).toBe("From what was sent to HomeSend: the Std. V column.\n\nWhat to study: from what was sent to HomeSend.");
  });

  it("says what a person would, never that nothing had a date", () => {
    const reply = syllabusReply([attached()], t, { origin: "https://home.wonderapps.biz" });
    expect(reply).toBe(
      "📚 Syllabus for Asmi's Mid-Term Unit Test 2 (Grade 5).\nI added what to study to 8 subjects: English, Hindi, French, Marathi, Mathematics, Science, Computing Theory, Humanities.\nSee or undo: https://home.wonderapps.biz/school?child=m-asmi#exams-m-asmi",
    );
    expect(reply).not.toContain("Nothing in it has a date");
    expect(syllabusReply([attached({ updated: ["Science"], revised: ["Science"] })], t, { origin: "o" })).toContain("I updated what to study for 1 subjects: Science.");
    expect(syllabusReply([attached({ updated: [], unchanged: true })], t, { origin: "o" })).toContain("It's already on record. Nothing changed.");
    expect(syllabusReply([attached({ unmatched: ["Art"] })], t, { origin: "o" })).toContain("Not in the timetable: Art. Kept as a note on the exam.");
  });
});
