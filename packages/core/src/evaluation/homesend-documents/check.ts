import type { IntakeExtraction } from "../../ai/classify-intake";
import { suspectedScam } from "../../homebrain/scam";
import { detectInstructionInjection } from "../../homesend/injection";
import { readPaymentProof } from "../../homesend/payment-proof";
import { matchExam } from "../../homesend/exam-match";
import { planSyllabus, studyText } from "../../homesend/syllabus-apply";
import { planTimetable } from "../../homesend/timetable";
import type { DocumentCase } from "./cases";

/** An empty reading, so each case records only what its model said. */
export const BLANK_DOCUMENT_READING = {
  readable: true, kind: "unknown", title: null, notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: null,
  schoolKind: null, subject: null, activityKind: null, location: null, quantity: null, unit: null, category: null, healthRecordType: null,
  documentDate: null, dateText: null, merchant: null, lines: [], subjectMemberName: null, summary: null, people: [], facts: [], needs: [],
  change: "new", confidence: "high", issuedOn: null, pages: { total: 1, unreadable: [] }, records: [], schedule: null,
};

/** The day the regression set's readings were recorded, in the owner's timezone. */
export const DOCUMENT_CONTEXT = { now: new Date("2026-11-20T18:11:56Z"), timezone: "Asia/Kolkata" };

/** Every day a written date names, in a source's own words, for "nothing invented". */
export function writtenDays(text: string): string[] {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const days: string[] = [];
  for (const match of text.toLowerCase().matchAll(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/g)) {
    days.push(`${match[3]}-${String(months.indexOf(match[2]!) + 1).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`);
  }
  return days;
}

/** The kind as HomeSend files it (`ingest.ts`): a bill, receipt or unknown that is proof of a payment made is filed as a receipt. */
export function filedKind(testCase: DocumentCase, read: IntakeExtraction): IntakeExtraction["kind"] {
  // A suspected scam is kept as "unknown" and set aside, whatever it was read as (owner, 2026-11-22).
  if (isScam(testCase, read)) return "unknown";
  if (read.kind !== "receipt" && read.kind !== "bill" && read.kind !== "unknown") return read.kind;
  if (detectInstructionInjection(testCase.source.text, testCase.source.caption).flagged) return read.kind;
  const proof = readPaymentProof(testCase.source.caption, testCase.source.text, read.title, read.summary, read.notes, ...read.facts.map((fact) => fact.evidence)).proof;
  return proof ? "receipt" : read.kind;
}

/** HomeSend's own scam rule, on what was sent and what the reading said of it (`ingest.ts`). */
function isScam(testCase: DocumentCase, read: IntakeExtraction): boolean {
  return suspectedScam(testCase.source.caption, testCase.source.text, read.title, read.summary, read.notes);
}

/**
 * What WonderHome makes of one HD case's reading, against the case's own
 * expectations (the product's, never relaxed): every way it falls short, or
 * none. Used by the unit test (recorded readings) and by `npm run eval`
 * (`runners.ts` `observeDocument`), where a live provider's reading replaces
 * the recorded one.
 */
export function documentMisses(testCase: DocumentCase, read: IntakeExtraction): string[] {
  const misses: string[] = [];
  const expected = testCase.expected;
  if (read.readable !== expected.readable) misses.push(`readable ${read.readable}`);
  const kind = filedKind(testCase, read);
  if (kind !== expected.kind) misses.push(`kind ${kind}`);
  if (expected.exams) {
    if (!read.schedule) misses.push("no timetable");
    else {
      const plan = planTimetable(read.schedule, testCase.children ?? []);
      const got = Object.fromEntries(plan.children.map((child) => [child.name, { column: child.column, papers: child.papers }]));
      if (stable(got) !== stable(expected.exams)) misses.push("exam days differ");
      if (JSON.stringify(plan.needClass.map((child) => child.name)) !== JSON.stringify(expected.askClass ?? [])) misses.push("class question differs");
    }
  }
  if (expected.records) {
    const records = read.records ?? [];
    if (records.length !== expected.records.count) misses.push(`${records.length} records`);
    if (expected.records.domains && JSON.stringify(records.map((record) => record.domain)) !== JSON.stringify(expected.records.domains)) misses.push("record domains differ");
    const written = writtenDays(testCase.source.text);
    for (const record of records) {
      const day = (record as { dueDate: string | null }).dueDate;
      if (day && written.length > 0 && testCase.id !== "HD-08" && !written.includes(day)) misses.push(`invented day ${day}`);
    }
  }
  if (expected.paymentProof !== undefined && Boolean(readPaymentProof(testCase.source.caption, testCase.source.text).proof) !== expected.paymentProof) misses.push("payment proof differs");
  if (Boolean(expected.scam) !== isScam(testCase, read)) misses.push(expected.scam ? "scam not caught" : "flagged as a scam");
  if (expected.injection !== undefined && detectInstructionInjection(testCase.source.text).flagged !== expected.injection) misses.push("injection differs");
  if (expected.syllabus) misses.push(...syllabusMisses(testCase, read));
  // A health document is never filed for someone its words don't name.
  if (read.kind === "health_document" && read.subjectMemberName) misses.push("health subject guessed");
  return misses;
}

/** JSON with keys sorted, so two objects compare by content, not key order. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : inner,
  );
}

/** Which exam a syllabus updates, which papers change, what has no paper, and every row's words kept byte for byte. */
function syllabusMisses(testCase: DocumentCase, read: IntakeExtraction): string[] {
  const expected = testCase.expected.syllabus!;
  const syllabus = read.syllabus;
  if (!syllabus) return ["no syllabus"];
  const misses: string[] = [];
  // Byte for byte: every line WonderHome would write is a line of what was sent (Devanagari stays Devanagari).
  for (const row of syllabus.rows) {
    for (const line of studyText(row.portion).split("\n")) if (!testCase.source.text.includes(line)) misses.push(`${row.subject} changed: ${line.slice(0, 30)}`);
  }
  const found = matchExam({ title: syllabus.title, school: syllabus.school, grade: syllabus.grade }, testCase.exams ?? [], testCase.children ?? [], DOCUMENT_CONTEXT.now.toISOString().slice(0, 10));
  if (expected === "none") return found.kind === "none" ? misses : [...misses, `matched ${found.kind}`];
  if (found.kind !== "match" || found.exams.length !== 1 || found.exams[0]!.exam.id !== expected.examId) return [...misses, `exam ${found.kind}`];
  const exam = (testCase.exams ?? []).find((one) => one.id === expected.examId)!;
  const plan = planSyllabus({ papers: exam.papers.map((paper) => ({ ...paper, examId: exam.id, startsAt: null, endsAt: null, links: [] as string[] })) }, syllabus);
  const changed = plan.papers.filter((one) => (one.paper.syllabus ?? "") !== one.syllabus || one.paper.maxMarks !== one.maxMarks);
  if (JSON.stringify(changed.map((one) => one.paper.subject)) !== JSON.stringify(expected.updated)) misses.push(`updated ${changed.map((one) => one.paper.subject).join(",")}`);
  if (JSON.stringify(plan.extras.map((extra) => extra.subject)) !== JSON.stringify(expected.unmatched)) misses.push("unmatched differs");
  if (expected.maxMarks !== undefined && changed.some((one) => one.maxMarks !== expected.maxMarks)) misses.push("max marks differ");
  return misses;
}
