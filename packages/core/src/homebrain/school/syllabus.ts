import type { IntakeSyllabus } from "../../ai/classify-intake";
import { type Exam, type ExamPaper } from "../../school/exams";
import { maxMarksOf, paperFor } from "./exam-match";

const EXTRA_MARK = "Also in the syllabus";
const SOURCE_LINE = "What to study: from what was sent to HomeSend.";

export type PaperPlan = { paper: ExamPaper; syllabus: string; maxMarks: number | null };

/** What a paper's "What to study" holds: the row's words as written, one part per line, blank lines and stray spaces gone. */
export function studyText(portion: string): string {
  return portion
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

/** The exam's notes with the syllabus subjects that have no paper, replacing any earlier such block. */
export function notesWithExtras(notes: string | null, extras: { subject: string; text: string }[]): string | null {
  const kept = (notes ?? "")
    .split(`\n\n${EXTRA_MARK}`)[0]!
    .split("\n")
    .filter((line) => line.trim() !== SOURCE_LINE)
    .join("\n")
    .trim();
  const parts = [kept, SOURCE_LINE];
  if (extras.length > 0) parts.push(`${EXTRA_MARK} (no paper in the timetable):\n${extras.map((extra) => `${extra.subject}:\n${extra.text}`).join("\n\n")}`);
  return parts.filter(Boolean).join("\n\n").slice(0, 2000) || null;
}

/** Pure: which papers change and how, and which rows have no paper. */
export function planSyllabus(exam: Pick<Exam, "papers">, syllabus: Pick<IntakeSyllabus, "rows">): { papers: PaperPlan[]; extras: { subject: string; text: string }[] } {
  const papers: PaperPlan[] = [];
  const extras: { subject: string; text: string }[] = [];
  for (const row of syllabus.rows) {
    const text = studyText(row.portion);
    if (!text) continue;
    const paper = paperFor(row.subject, exam.papers);
    if (!paper || papers.some((plan) => plan.paper.id === paper.id)) {
      extras.push({ subject: row.subject.trim(), text });
      continue;
    }
    papers.push({ paper, syllabus: text, maxMarks: maxMarksOf(row.marks) ?? paper.maxMarks });
  }
  return { papers, extras };
}
