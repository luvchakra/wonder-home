import { classOf, sameSchool, type TimetableChild } from "./timetable";

/**
 * What a school document is ABOUT, found among the household's own exams
 * (2026-11-21, the owner: "it should correlate that the syllabus is related
 * with the existing MTUT2 Timetable"). Pure and evidence-based: a match is
 * the exam's name (normalised: "Mid Term Unit Test 2", "Mid-Term Unit Test 2"
 * and "MTUT2" are one name), the child's class ("Grade 5" = "Std. V"), the
 * school (naming variants of the enrolment's school) and the date window.
 * Every reason is kept as evidence, so "Why?" is told from it, never from a
 * model. A model may point at a candidate; this code still checks it.
 *
 *   - one exam (or one per child of the same class) fits → `match`;
 *   - two exams of the same child both fit → `ambiguous` (the one question);
 *   - none → `none`, and the caller keeps today's behaviour.
 */

export type ExamCandidate = {
  id: string;
  childMemberId: string;
  examType: string;
  title: string | null;
  papers: { id: string; subject: string; onDate: string }[];
};

export type ExamDocument = {
  /** The document's own name for the exam, as written ("Mid Term Unit Test 2 -2026-27 / Grade 5: Syllabus"). */
  title: string | null;
  school: string | null;
  /** The class it names, as written ("Grade 5"). */
  grade: string | null;
};

export type ExamEvidence =
  | { kind: "name"; document: string; exam: string }
  | { kind: "class"; document: string; child: string }
  | { kind: "school"; document: string; child: string }
  | { kind: "window"; from: string; to: string };

export type ExamMatch =
  | { kind: "match"; exams: { exam: ExamCandidate; child: TimetableChild; evidence: ExamEvidence[] }[] }
  | { kind: "ambiguous"; exams: { exam: ExamCandidate; child: TimetableChild }[] }
  | { kind: "none" };

const DOC_WORDS = /\b(syllabus|syllabi|portion|portions|timetable|time table|date ?sheet|schedule|hall ticket|admit card|result|results|report card|for|of|the|and|exam|exams|examination|examinations|test|tests)\b/g;

/**
 * "Mid Term Unit Test 2 -2026-27 / Grade 5: Syllabus" → "mtut2"; "Mid-Term
 * Unit Test 2" → "mtut2"; "MTUT 2 Timetable" → "mtut2"; "Unit Test II" →
 * "ut2"; "Half Yearly Examination" → "hy". Years, class names and document
 * words ("syllabus", "timetable") are not part of an exam's name.
 */
export function examKey(name: string | null | undefined): string {
  if (!name) return "";
  let text = ` ${name.toLowerCase()} `
    .replace(/\b(19|20)\d{2}\s*[-/–]\s*\d{2,4}\b/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(std|standard|class|grade|gr)\.?\s*([0-9]{1,2}|[ivx]{1,4})(\s*[-/ ]\s*[a-z]\b)?/g, " ")
    .replace(/[^a-z0-9]+/g, " ");
  text = text
    .replace(/\bmid\s*term\b/g, " mt ")
    .replace(/\bhalf\s*yearly\b/g, " hy ")
    .replace(/\bunit\s*test\b/g, " ut ")
    .replace(/\bperiodic\s*test\b/g, " pt ")
    .replace(/\bperiodic\s*assessment\b/g, " pa ")
    .replace(/\bformative\s*assessment\b/g, " fa ")
    .replace(/\bsummative\s*assessment\b/g, " sa ")
    .replace(/\bterm\b/g, " t ")
    .replace(DOC_WORDS, " ");
  // A trailing Roman numeral is a number: "Unit Test II" = "Unit Test 2".
  const roman: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };
  const words = text.split(/\s+/).filter(Boolean).map((word, index, all) => (index > 0 && index === all.length - 1 && roman[word] ? roman[word]! : word));
  return words.join("");
}

/** The open window of an exam: its first and last paper. */
function windowOf(exam: ExamCandidate): { from: string; to: string } | null {
  const days = exam.papers.map((paper) => paper.onDate).sort();
  return days.length > 0 ? { from: days[0]!, to: days[days.length - 1]! } : null;
}

/**
 * Which of the household's exams the document is about. Only exams whose
 * last paper is no more than 60 days past (`today`) are open to a match: last
 * year's Mid-Term is never this year's syllabus.
 */
export function matchExam(document: ExamDocument, exams: readonly ExamCandidate[], children: readonly TimetableChild[], today: string): ExamMatch {
  const key = examKey(document.title);
  if (!key) return { kind: "none" };
  const wanted = classOf(document.grade);
  const cutoff = shiftIso(today, -60);
  const fits: { exam: ExamCandidate; child: TimetableChild; evidence: ExamEvidence[] }[] = [];
  for (const exam of exams) {
    const name = exam.title ?? exam.examType;
    if (examKey(name) !== key) continue;
    const child = children.find((one) => one.memberId === exam.childMemberId);
    if (!child) continue;
    const evidence: ExamEvidence[] = [{ kind: "name", document: document.title!, exam: name }];
    // A class the document names must be the child's: a Grade 6 syllabus never updates a Grade 5 child's exam.
    if (wanted.grade !== null) {
      const have = classOf(child.grade);
      if (have.grade === null || have.grade !== wanted.grade) continue;
      evidence.push({ kind: "class", document: document.grade!, child: child.grade! });
    }
    // A school the document names must be the child's, allowing for naming variants.
    if (document.school && child.school) {
      if (!sameSchool(document.school, child.school)) continue;
      evidence.push({ kind: "school", document: document.school, child: child.school });
    }
    const window = windowOf(exam);
    if (window && window.to < cutoff) continue;
    if (window) evidence.push({ kind: "window", ...window });
    fits.push({ exam, child, evidence });
  }
  if (fits.length === 0) return { kind: "none" };
  // Two exams of one child that both fit: asked, never guessed.
  const perChild = new Map<string, number>();
  for (const fit of fits) perChild.set(fit.child.memberId, (perChild.get(fit.child.memberId) ?? 0) + 1);
  if ([...perChild.values()].some((count) => count > 1)) return { kind: "ambiguous", exams: fits.map(({ exam, child }) => ({ exam, child })) };
  return { kind: "match", exams: fits };
}

function shiftIso(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const SUBJECT_ALIASES: Record<string, string> = {
  maths: "mathematics",
  math: "mathematics",
  computer: "computing",
  computers: "computing",
  "computer science": "computing",
  ict: "computing",
  it: "computing",
  "social studies": "humanities",
  sst: "humanities",
  "e v s": "evs",
  "environmental studies": "evs",
  "2nd language": "second language",
};

function subjectKey(subject: string): string {
  const plain = subject
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return SUBJECT_ALIASES[plain] ?? plain;
}

/**
 * The paper a syllabus row is for, or null. Tolerant but never a guess:
 * the same name ("Maths" = "Mathematics"), or one name the first words of
 * the other ("Computing" = "Computing Theory") when only one paper fits; a
 * row naming options ("Hindi/French") fits the paper that is one of them.
 */
export function paperFor<P extends { subject: string }>(rowSubject: string, papers: readonly P[]): P | null {
  const options = rowSubject.split(/\s*(?:\/|\bor\b)\s*/i).map(subjectKey).filter(Boolean);
  for (const pass of [exact, leading] as const) {
    const found = papers.filter((paper) => options.some((option) => pass(option, subjectKey(paper.subject))));
    if (found.length === 1) return found[0]!;
    if (found.length > 1) return null;
  }
  return null;
}

const exact = (a: string, b: string) => a === b;
const leading = (a: string, b: string) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && (long.startsWith(`${short} `) || SUBJECT_ALIASES[long.split(" ")[0]!] === short);
};

/** "20 Mks", "MTUT 20", "20 marks [Project based]", "Max 20" → 20; nothing sensible → null. */
export function maxMarksOf(text: string | null | undefined): number | null {
  if (!text) return null;
  const numbers = [...text.matchAll(/(?<![\d.])(\d{1,3})(?![\d.])/g)].map((match) => Number(match[1]));
  const sensible = numbers.filter((value) => value >= 5 && value <= 200);
  return sensible.length === 1 ? sensible[0]! : null;
}

/**
 * The household's open exams, in a fixed order (first day, then id): what
 * the reading prompt lists as "Exam 1, Exam 2…" and what `examRef` is
 * checked against when the document is applied.
 */
export function openExams<E extends ExamCandidate>(exams: readonly E[], today: string): E[] {
  const cutoff = shiftIso(today, -60);
  return exams
    .filter((exam) => {
      const window = windowOf(exam);
      return window !== null && window.to >= cutoff;
    })
    .sort((a, b) => windowOf(a)!.from.localeCompare(windowOf(b)!.from) || a.id.localeCompare(b.id));
}
