import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../observability/logger";
import { listExams, saveExam, savePaper, standDownSchoolRecord, type Exam, type ExamPaper } from "../school/exams";
import { matchExam, notesWithExtras, openExams, planSyllabus, readsAboveTheBar, type ExamEvidence } from "../homebrain/intake-api";
import { recordHomeSendChange } from "./changes";
import type { HomeSendItem } from "./items";
import { timetableChildren } from "./timetable-apply";

/**
 * A syllabus sent to HomeSend updates the exam it is about (2026-11-21, the
 * owner: "it should correlate that the syllabus is related with the existing
 * MTUT2 Timetable. and then look through the subjects and update each subject
 * notes properly"). The general step, before a reading is filed as something
 * new or kept as a note: find the household's own record it is ABOUT
 * (`exam-match.ts`, evidence only), then update that record in place.
 *
 * - Each subject row goes to the matching paper's "What to study" (its text
 *   exactly as written, script and all, one part per line) and max marks.
 *   A row naming no paper is listed in the reply and kept on the exam's
 *   notes; a paper with no row is left untouched.
 * - One `homesend_changes` row per exam, `updated`, with every paper's
 *   previous words and marks, so one Undo puts them all back
 *   (`restoreExamSyllabus`). Above the household's bar it is confirmed,
 *   below it Checking, as for any school entry. Not money, not health.
 * - Sent again: only what differs is written (and said); the same syllabus
 *   twice changes nothing and is never a second copy.
 * - No exam fits (the syllabus came before the timetable): nothing is
 *   written; the caller keeps it as a note, and `attachKeptSyllabi` brings
 *   it to the exam when the timetable arrives. Two exams of one child both
 *   fit: also kept as a note for now (the question is a follow-up, 14-079).
 */

export type SyllabusAttached = {
  examId: string;
  examName: string;
  childMemberId: string;
  childName: string;
  /** The class as the document wrote it ("Grade 5"). */
  grade: string | null;
  /** Papers whose study words or marks were added or changed, in the document's order (the paper's own subject). */
  updated: string[];
  /** Of those, the ones that already had study words (a revised syllabus). */
  revised: string[];
  /** Subjects in the syllabus with no paper in the exam: kept on the exam's notes. */
  unmatched: string[];
  /** Nothing differed from what is on record. */
  unchanged: boolean;
  checking: boolean;
  evidence: ExamEvidence[];
};


export async function attachSyllabus(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    item: Pick<HomeSendItem, "id" | "source" | "extracted" | "createdByMemberId" | "understanding">;
    actorMemberId: string | null;
    today?: string;
  },
): Promise<SyllabusAttached[] | null> {
  const syllabus = input.item.extracted?.syllabus ?? null;
  if (!syllabus || syllabus.rows.length === 0) return null;
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const [children, exams] = await Promise.all([timetableChildren(supabase, input.householdId), listExams(supabase, input.householdId).catch(() => [] as Exam[])]);
  const found = matchExam({ title: syllabus.title, school: syllabus.school, grade: syllabus.grade }, exams, children, today);
  let fits: { exam: Exam; childName: string; evidence: ExamEvidence[] }[] = [];
  if (found.kind === "match") {
    fits = found.exams.map((fit) => ({ exam: fit.exam as Exam, childName: fit.child.name, evidence: fit.evidence }));
  } else if (found.kind === "ambiguous" && syllabus.examRef) {
    // The model pointed at one of the open exams it was shown: used only when it is one of the exams the evidence already fits.
    const pointed = openExams(exams, today)[syllabus.examRef - 1];
    const chosen = pointed ? found.exams.find((fit) => fit.exam.id === pointed.id) : undefined;
    if (chosen) fits = [{ exam: chosen.exam as Exam, childName: chosen.child.name, evidence: [{ kind: "name", document: syllabus.title ?? "", exam: chosen.exam.title ?? chosen.exam.examType }] }];
  }
  if (fits.length === 0) return null;

  const checking = !(await readsAboveTheBar(supabase, input.householdId, "school_item", input.item.understanding?.score));
  const by = input.actorMemberId ?? input.item.createdByMemberId;
  const results: SyllabusAttached[] = [];
  for (const fit of fits) {
    const { exam } = fit;
    const plan = planSyllabus(exam, syllabus);
    const changed = plan.papers.filter((one) => (one.paper.syllabus ?? "") !== one.syllabus || one.paper.maxMarks !== one.maxMarks);
    const notes = notesWithExtras(exam.notes, plan.extras);
    const notesChanged = (exam.notes ?? null) !== notes;
    for (const one of changed) {
      await savePaper(supabase, {
        householdId: input.householdId,
        examId: exam.id,
        id: one.paper.id,
        subject: one.paper.subject,
        onDate: one.paper.onDate,
        startsAt: one.paper.startsAt,
        endsAt: one.paper.endsAt,
        syllabus: one.syllabus,
        maxMarks: one.maxMarks,
        links: one.paper.links,
      });
    }
    if (notesChanged) await saveExam(supabase, { householdId: input.householdId, id: exam.id, childMemberId: exam.childMemberId, examType: exam.examType, title: exam.title, notes });
    if (by && (changed.length > 0 || notesChanged)) {
      await recordHomeSendChange(supabase, {
        householdId: input.householdId,
        intakeId: input.item.id,
        domain: "school_exam",
        entityId: exam.id,
        createdByMemberId: by,
        changeType: "updated",
        previous: { notes: exam.notes, papers: changed.map((one) => ({ id: one.paper.id, syllabus: one.paper.syllabus, maxMarks: one.paper.maxMarks })) },
        auto: { state: checking ? "unconfirmed" : "confirmed", confidence: input.item.understanding?.score ?? null, source: input.item.source },
      }).catch((thrown: unknown) => {
        log.warn("homesend: syllabus change not recorded", { reason: thrown instanceof Error ? thrown.message.slice(0, 60) : "unknown", allow: ["reason"] });
      });
    }
    results.push({
      examId: exam.id,
      examName: exam.title ?? exam.examType,
      childMemberId: exam.childMemberId,
      childName: fit.childName,
      grade: syllabus.grade,
      updated: changed.map((one) => one.paper.subject),
      revised: changed.filter((one) => one.paper.syllabus).map((one) => one.paper.subject),
      unmatched: plan.extras.map((extra) => extra.subject),
      unchanged: changed.length === 0 && !notesChanged,
      checking,
      evidence: fit.evidence,
    });
  }
  // The item now belongs to the (first) exam: opened from it, never kept as a note. A kept note is brought back too.
  const { error } = await supabase
    .from("home_send_items")
    .update({ status: "routed", routed_table: "school_exams", routed_id: results[0]!.examId, routed_at: new Date().toISOString(), archive_reason: null, archived_at: null, archived_from: null })
    .eq("household_id", input.householdId)
    .eq("id", input.item.id);
  if (error) log.warn("homesend: syllabus item not linked", { reason: error.code ?? "unknown", allow: ["reason"] });
  return results;
}

/**
 * Undo of an update to an exam (a syllabus, or a revised timetable): every
 * paper's study words, marks and day, and the exam's notes, as they were
 * before (`homesend_changes.previous`); papers a revision added are stood down.
 */
export async function restoreExamSyllabus(
  supabase: SupabaseClient,
  input: { householdId: string; examId: string; previous: Record<string, unknown> },
): Promise<void> {
  const exams = await listExams(supabase, input.householdId);
  const exam = exams.find((one) => one.id === input.examId);
  if (!exam) return;
  const before = Array.isArray(input.previous.papers) ? (input.previous.papers as { id?: unknown; syllabus?: unknown; maxMarks?: unknown }[]) : [];
  for (const old of before) {
    const paper = exam.papers.find((one) => one.id === old.id);
    if (!paper) continue;
    await savePaper(supabase, {
      householdId: input.householdId,
      examId: exam.id,
      id: paper.id,
      subject: paper.subject,
      onDate: typeof (old as { onDate?: unknown }).onDate === "string" ? ((old as { onDate: string }).onDate) : paper.onDate,
      startsAt: paper.startsAt,
      endsAt: paper.endsAt,
      syllabus: "syllabus" in old ? (typeof old.syllabus === "string" ? old.syllabus : null) : paper.syllabus,
      maxMarks: "maxMarks" in old ? (typeof old.maxMarks === "number" ? old.maxMarks : null) : paper.maxMarks,
      links: paper.links,
    });
  }
  // A revised timetable's added papers are stood down.
  const added = Array.isArray(input.previous.addedPaperIds) ? (input.previous.addedPaperIds as unknown[]).filter((id): id is string => typeof id === "string") : [];
  for (const id of added) await standDownSchoolRecord(supabase, { householdId: input.householdId, id, kind: "paper" }).catch(() => undefined);
  if ("notes" in input.previous) {
    await saveExam(supabase, { householdId: input.householdId, id: exam.id, childMemberId: exam.childMemberId, examType: exam.examType, title: exam.title, notes: typeof input.previous.notes === "string" ? input.previous.notes : null });
  }
}

/**
 * A syllabus that arrived before its timetable was kept as a note; when the
 * timetable makes the exam, each such note (the last 120 days) is brought to
 * it. Never throws: the timetable is already added.
 */
export async function attachKeptSyllabi(supabase: SupabaseClient, input: { householdId: string; actorMemberId: string | null }): Promise<SyllabusAttached[]> {
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("home_send_items")
    .select("id, source, extracted, created_by_member_id, understanding")
    .eq("household_id", input.householdId)
    .eq("status", "archived")
    .eq("archive_reason", "kept_as_note")
    .eq("classified_kind", "school_item")
    .not("extracted->syllabus", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(10);
  const attached: SyllabusAttached[] = [];
  for (const row of (data ?? []) as { id: string; source: HomeSendItem["source"]; extracted: HomeSendItem["extracted"]; created_by_member_id: string | null; understanding: HomeSendItem["understanding"] }[]) {
    const done = await attachSyllabus(supabase, {
      householdId: input.householdId,
      item: { id: row.id, source: row.source, extracted: row.extracted, createdByMemberId: row.created_by_member_id, understanding: row.understanding },
      actorMemberId: input.actorMemberId,
    }).catch(() => null);
    if (done) attached.push(...done);
  }
  return attached;
}
