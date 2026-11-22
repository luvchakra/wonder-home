import type { ExamCandidate } from "../../homebrain/school/exam-match";

/**
 * A synthetic copy of the owner's "Mid Term Unit Test 2 – Grade 5: Syllabus"
 * (2026-11-21; the original PDF stays with the owner): one row per subject,
 * three scripts (Latin, Devanagari for Hindi and Marathi), French continued
 * across the page break, and no dates (they are in the timetable). The text
 * is what a reader of the PDF sees; the rows are what a model must copy,
 * exactly, script and all.
 */

export const SYLLABUS_ROWS = [
  {
    subject: "English",
    portion: "1. Reading - Non-fiction, Unit 2: People in the news (BK6)\n2. Writing Task - Write a mini report / Write a news article\n3. Grammar - Pronouns, Relative pronouns, Reported speech, Fact and Opinion, Words with more impact, Portmanteau words",
    marks: "20 Mks",
  },
  { subject: "Hindi", portion: "1) अपठित गद्यांश\nव्याकरण\n1) विशेषण\n2) पर्यायवाची शब्द\nजानकारी\n1) गिनती ७६ से १०० (शब्दों तथा अंकों में)", marks: "MTUT 20" },
  { subject: "French", portion: "Unit 4B Les adjectifs\nUnit 4C Tu as des questions?\nUnit 4D Tu aimes ça? Et vous aussi?\nGrammar: ER, IR ending verbs\nNumbers 1-100\nHow to ask questions?", marks: "20 marks" },
  { subject: "Marathi", portion: "१३. अनुभव- १ (Passage)\n१५. नदीचे गाणे\nअंक -३१-४५", marks: "20 marks" },
  {
    subject: "Mathematics",
    portion: "Ch. 6 Fractions, decimals and percentages\n6.1 Understanding fractions (Book 6)\n6.2 Percentages (Book 6)\n6.3 Equivalence and comparison (Book 6)\nCh. 8 Addition and subtraction (2) (Book 6)\n8.2 Adding and subtracting fractions",
    marks: "20 marks",
  },
  { subject: "Science", portion: "Stage 6: Unit 3 Rocks, the rock cycle and soil (3.1 to 3.4)", marks: "20 marks" },
  { subject: "Computing", portion: "Unit 3: Networks and digital communication\n3.1 Network hardware\n3.2 How data travels through networks\n3.3 Network failure", marks: "20 marks" },
  { subject: "Humanities", portion: "Geography: Ch.3 Coasts", marks: "20 marks [Project based]" },
] as const;

const HEADER = "PODAR INTERNATIONAL SCHOOL (CAMBRIDGE)\nCambridge Assessment International Education\nMid Term Unit Test 2 -2026-27\nGrade 5: Syllabus\nSubjects | Syllabus for MTUT | Sub-topics | Max Marks";

/** The document's text, page break and all (French runs onto page 2). */
export const SYLLABUS_TEXT = [
  HEADER,
  ...SYLLABUS_ROWS.map((row) =>
    row.subject === "French"
      ? `French | ${row.portion.split("\n").slice(0, 3).join("\n")}\n--- page 2 ---\n${row.portion.split("\n").slice(3).join("\n")} | ${row.marks}`
      : `${row.subject} | ${row.portion} | ${row.marks}`,
  ),
].join("\n");

/** The reading a model gave for it (recorded): the rows copied exactly. */
export function syllabusReading(over: { grade?: string; rows?: readonly { subject: string; portion: string; marks: string | null }[] } = {}) {
  return {
    kind: "school_item",
    title: "Mid Term Unit Test 2 Grade 5 Syllabus",
    schoolKind: "notice",
    syllabus: {
      title: "Mid Term Unit Test 2 -2026-27",
      school: "PODAR INTERNATIONAL SCHOOL (CAMBRIDGE)",
      grade: over.grade ?? "Grade 5",
      examRef: null,
      rows: (over.rows ?? SYLLABUS_ROWS).map((row) => ({ ...row })),
    },
  };
}

/** An exam on record as a case gives it: each paper with its current study words and marks. */
export type RecordedExam = Omit<ExamCandidate, "papers"> & { papers: { id: string; subject: string; onDate: string; syllabus: string | null; maxMarks: number | null }[] };

/** Asmi's Mid-Term Unit Test 2 as the Std. V column of the timetable made it (the eight papers on record). */
export function asmiMtut2(syllabusOf: Partial<Record<string, string>> = {}): RecordedExam {
  const days: [string, string][] = [
    ["Science", "2026-12-03"],
    ["Humanities", "2026-12-04"],
    ["Mathematics", "2026-12-07"],
    ["English", "2026-12-08"],
    ["Computing Theory", "2026-12-09"],
    ["French", "2026-12-10"],
    ["Hindi", "2026-12-11"],
    ["Marathi", "2026-12-14"],
  ];
  return {
    id: "e-asmi-mtut2",
    childMemberId: "m-asmi",
    examType: "Mid-term",
    title: "Mid-Term Unit Test 2",
    papers: days.map(([subject, onDate], index) => ({ id: `p${index}`, subject, onDate, syllabus: syllabusOf[subject] ?? null, maxMarks: null })),
  };
}
