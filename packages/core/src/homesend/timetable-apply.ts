import type { SupabaseClient } from "@supabase/supabase-js";

import { askNeedsYou, closeNeedsYou } from "../hometalk/needs-you-repository";
import { listMembers } from "../identity/households";
import { log } from "../observability/logger";
import { listEnrolments, saveEnrolment } from "../school/enrolments";
import { listExams, saveExam, savePaper, type Exam } from "../school/exams";
import { readsAboveTheBar } from "./above-bar";
import { recordHomeSendChange } from "./changes";
import type { HomeSendItem } from "./items";
import { routeHomeSendItem } from "./repository";
import { examKey, paperFor } from "./exam-match";
import { attachKeptSyllabi, type SyllabusAttached } from "./syllabus-apply";
import { classOf, planTimetable, type TimetableChild, type TimetablePaper, type TimetablePlan } from "./timetable";

/**
 * An exam timetable read from what was sent becomes each child's exam, at
 * once (2026-11-21, the owner: "HomeSend can understand these complex messages
 * … and populate required Artifacts"). One `school_exams` row per child with
 * one paper per exam day, in the School area and on the calendar
 * (`school/exams.ts` `examEntries`), its reminders through the school reminder
 * source (`notifications/sources.ts` `examPaperSubject`).
 *
 * - Written with the client it is given: the sender's own session (WhatsApp,
 *   the app) or an answer's; the database decides who may change a child's
 *   records, never this code.
 * - Each exam is one `homesend_changes` row of the source item (domain
 *   `school_exam`), so it opens to the item, is undone with the item or on
 *   its own, and is marked Checking when read from a photo or file.
 * - A child at the school whose class isn't on record is asked once, "Which
 *   class is <child> in?", with the table's columns as the answers
 *   (`homesend_class`); the answer is saved on the child's school record, so
 *   it is never asked again, and that child's days are added then.
 * - Idempotent: a child who already has an active exam of the same name gets
 *   no second one.
 */

export const CLASS_QUESTION_SOURCE = "homesend_class";

export type TimetableAdded = {
  title: string | null;
  examType: TimetablePlan["examType"];
  /** Each child added for: their class column, how many exam days, first and last day (ISO). */
  children: { memberId: string; name: string; column: string; count: number; from: string; to: string; examId: string }[];
  /** Children asked "Which class is <child> in?". */
  asked: { memberId: string; name: string }[];
  checking: boolean;
  /** A revised timetable for an exam on record: each child's moved or added days, updated in place (2026-11-21). */
  revised?: { memberId: string; name: string; examId: string; moved: string[]; added: string[] }[];
  /** Syllabi kept as notes before this timetable arrived, now brought to its exams. */
  syllabi?: SyllabusAttached[];
};

export async function timetableChildren(supabase: SupabaseClient, householdId: string): Promise<TimetableChild[]> {
  const [members, enrolments] = await Promise.all([listMembers(supabase, householdId, null).catch(() => []), listEnrolments(supabase, householdId).catch(() => [])]);
  const children = members.filter((member) => member.memberType === "child" && member.status === "active");
  return children.map((child) => {
    const enrolment = enrolments.find((row) => row.childMemberId === child.id) ?? null;
    return { memberId: child.id, name: child.displayName, grade: enrolment?.grade ?? null, school: enrolment?.schoolName ?? null };
  });
}

export async function addTimetable(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    item: Pick<HomeSendItem, "id" | "source" | "extracted" | "createdByMemberId" | "filePath" | "understanding">;
    actorMemberId: string | null;
    /** Only this child (after "Which class is <child> in?" was answered). */
    onlyChildId?: string;
    /** Ask about children whose class isn't on record (false when answering that very question). */
    ask?: boolean;
  },
): Promise<TimetableAdded | null> {
  const schedule = input.item.extracted?.schedule ?? null;
  if (!schedule || schedule.kind !== "exam") return null;
  const everyone = await timetableChildren(supabase, input.householdId);
  const plan = planTimetable(schedule, input.onlyChildId ? everyone.filter((child) => child.memberId === input.onlyChildId) : everyone);
  // More sure than the household's bar: confirmed, whatever it was read from (the owner, 2026-11-21). Below it: Checking.
  const checking = !(await readsAboveTheBar(supabase, input.householdId, "school_item", input.item.understanding?.score));
  const added: TimetableAdded = { title: plan.title, examType: plan.examType, children: [], asked: [], checking };

  // Through the School area's own read, never this module's: HomeSend writes and reads only through domain services.
  const existing = await listExams(supabase, input.householdId).catch(() => []);
  // The same exam by name ("MTUT 2" = "Mid-Term Unit Test 2", `exam-match.ts` `examKey`): updated in place, never a second one.
  const sameExam = (memberId: string) => existing.find((exam) => exam.childMemberId === memberId && examKey(exam.title ?? exam.examType) === examKey(plan.title) && examKey(plan.title) !== "");

  for (const child of plan.children) {
    const onRecord = sameExam(child.memberId);
    if (onRecord) {
      const revised = await reviseExam(supabase, { householdId: input.householdId, exam: onRecord, papers: child.papers, item: input.item, by: input.actorMemberId ?? input.item.createdByMemberId, checking });
      if (revised.moved.length > 0 || revised.added.length > 0) (added.revised ??= []).push({ memberId: child.memberId, name: child.name, examId: onRecord.id, ...revised });
      continue;
    }
    const exam = await saveExam(supabase, { householdId: input.householdId, childMemberId: child.memberId, examType: plan.examType, title: plan.title?.slice(0, 120) ?? null, notes: `From what was sent to HomeSend: the ${child.column} column.` });
    for (const paper of child.papers) {
      await savePaper(supabase, { householdId: input.householdId, examId: exam.id, subject: paper.subject, onDate: paper.onDate, startsAt: null, endsAt: null, syllabus: null, links: [] });
    }
    const by = input.actorMemberId ?? input.item.createdByMemberId;
    if (by) await recordHomeSendChange(supabase, {
      householdId: input.householdId,
      intakeId: input.item.id,
      domain: "school_exam",
      entityId: exam.id,
      createdByMemberId: by,
      auto: { state: checking ? "unconfirmed" : "confirmed", confidence: null, source: input.item.source },
    }).catch((thrown: unknown) => {
      // Before the migration knows the domain, the exam stands on its own (undone from the School page).
      log.warn("homesend: exam change not recorded", { reason: thrown instanceof Error ? thrown.message.slice(0, 60) : "unknown", allow: ["reason"] });
    });
    added.children.push({ memberId: child.memberId, name: child.name, column: child.column, count: child.papers.length, from: child.papers[0]!.onDate, to: child.papers[child.papers.length - 1]!.onDate, examId: exam.id });
  }

  const routedTo = added.children[0]?.examId ?? added.revised?.[0]?.examId;
  if (routedTo) await routeHomeSendItem(supabase, input.householdId, input.item.id, { routedTable: "school_exams", routedId: routedTo }).catch(() => undefined);
  // A syllabus sent before this timetable was kept as a note: now it has its exam (2026-11-21).
  if (added.children.length > 0) {
    const syllabi = await attachKeptSyllabi(supabase, { householdId: input.householdId, actorMemberId: input.actorMemberId }).catch(() => []);
    if (syllabi.length > 0) added.syllabi = syllabi;
  }

  // One child at a time: a question per item may be open at once (`needs_you_items_one_open`), so the next child is
  // asked as soon as this one is answered (`answerClassQuestion`). `askedAt` is required: without it nothing was asked (21 Nov).
  if (input.ask !== false) {
    for (const child of plan.needClass) {
      const asked = await askNeedsYou(supabase, {
        householdId: input.householdId,
        source: CLASS_QUESTION_SOURCE,
        subjectTable: "home_send_items",
        subjectId: input.item.id,
        recipientMemberId: input.item.createdByMemberId ?? input.actorMemberId,
        prompt: { code: "homesend.class", title: child.name, kind: "school_item", field: `class:${child.memberId}`, href: `/home-send?item=${input.item.id}` },
        answers: [...plan.columns.map((column) => ({ value: column })), { value: "note" }],
        defaultAnswer: "note",
        consequence: 1,
        dueOn: null,
        askedAt: new Date(),
      }).catch((thrown: unknown) => {
        log.warn("homesend: class question not asked", { reason: thrown instanceof Error ? thrown.message.slice(0, 60) : "unknown", allow: ["reason"] });
        return null;
      });
      if (asked) {
        added.asked.push(child);
        break;
      }
    }
  }
  return added.children.length > 0 || added.asked.length > 0 || (added.revised?.length ?? 0) > 0 ? added : null;
}

/**
 * A revised timetable for an exam already on record: a subject on a new day
 * is moved, a new subject is added, nothing is removed (a paper missing from
 * a revision may just be on another page). One `updated` change with each
 * moved paper's old day and the added papers, so Undo puts it back. The same
 * timetable sent again changes nothing.
 */
async function reviseExam(
  supabase: SupabaseClient,
  input: { householdId: string; exam: Exam; papers: TimetablePaper[]; item: Pick<HomeSendItem, "id" | "source" | "understanding">; by: string | null; checking: boolean },
): Promise<{ moved: string[]; added: string[] }> {
  const moved: { id: string; subject: string; onDate: string }[] = [];
  const addedIds: string[] = [];
  const addedSubjects: string[] = [];
  for (const paper of input.papers) {
    const onRecord = paperFor(paper.subject, input.exam.papers);
    if (onRecord) {
      if (onRecord.onDate === paper.onDate) continue;
      await savePaper(supabase, { householdId: input.householdId, examId: input.exam.id, id: onRecord.id, subject: onRecord.subject, onDate: paper.onDate, startsAt: onRecord.startsAt, endsAt: onRecord.endsAt, syllabus: onRecord.syllabus, links: onRecord.links });
      moved.push({ id: onRecord.id, subject: onRecord.subject, onDate: onRecord.onDate });
    } else {
      const saved = await savePaper(supabase, { householdId: input.householdId, examId: input.exam.id, subject: paper.subject, onDate: paper.onDate, startsAt: null, endsAt: null, syllabus: null, links: [] });
      addedIds.push(saved.id);
      addedSubjects.push(paper.subject);
    }
  }
  if (input.by && (moved.length > 0 || addedIds.length > 0)) {
    await recordHomeSendChange(supabase, {
      householdId: input.householdId,
      intakeId: input.item.id,
      domain: "school_exam",
      entityId: input.exam.id,
      createdByMemberId: input.by,
      changeType: "updated",
      previous: { papers: moved.map((one) => ({ id: one.id, onDate: one.onDate })), addedPaperIds: addedIds },
      auto: { state: input.checking ? "unconfirmed" : "confirmed", confidence: null, source: input.item.source },
    }).catch((thrown: unknown) => {
      log.warn("homesend: revised exam change not recorded", { reason: thrown instanceof Error ? thrown.message.slice(0, 60) : "unknown", allow: ["reason"] });
    });
  }
  return { moved: moved.map((one) => one.subject), added: addedSubjects };
}

/**
 * "Which class is <child> in?" answered: the class is saved on the child's
 * school record (so it is never asked again), then that child's exam days are
 * added. "Keep it as a note" (and the default after a day) adds nothing: the
 * deadlines pass keeps the timetable as a school note.
 */
export async function answerClassQuestion(
  supabase: SupabaseClient,
  input: { householdId: string; itemId: string; childMemberId: string; answer: string; actorMemberId: string | null; questionId?: string },
): Promise<boolean> {
  if (input.answer === "note") return true;
  const grade = classOf(input.answer).grade;
  if (!grade) return false;
  const { data: item } = await supabase
    .from("home_send_items")
    .select("id, source, extracted, created_by_member_id, file_path, understanding")
    .eq("household_id", input.householdId)
    .eq("id", input.itemId)
    .maybeSingle();
  if (!item) return false;
  const enrolments = await listEnrolments(supabase, input.householdId).catch(() => []);
  const enrolment = enrolments.find((row) => row.childMemberId === input.childMemberId);
  const school = enrolment?.schoolName ?? ((item.extracted as { schedule?: { school?: string | null } } | null)?.schedule?.school ?? null);
  if (!school) return false;
  await saveEnrolment(supabase, { householdId: input.householdId, childMemberId: input.childMemberId, schoolName: school, grade: String(grade) });
  const row = item as { id: string; source: HomeSendItem["source"]; extracted: HomeSendItem["extracted"]; created_by_member_id: string | null; file_path: string | null; understanding: HomeSendItem["understanding"] };
  const added = await addTimetable(supabase, {
    householdId: input.householdId,
    item: { id: row.id, source: row.source, extracted: row.extracted, createdByMemberId: row.created_by_member_id, filePath: row.file_path, understanding: row.understanding },
    actorMemberId: input.actorMemberId,
    onlyChildId: input.childMemberId,
    ask: false,
  });
  // Then the next child at the school whose class isn't on record is asked, this question closed first so it can be
  // (one open per item); exams already added are never added twice (`addTimetable` skips them).
  if (input.questionId) {
    await closeNeedsYou(supabase, input.questionId, { status: "answered", answer: input.answer, memberId: input.actorMemberId }).catch(() => false);
    await addTimetable(supabase, { householdId: input.householdId, item: { id: row.id, source: row.source, extracted: row.extracted, createdByMemberId: row.created_by_member_id, filePath: row.file_path, understanding: row.understanding }, actorMemberId: input.actorMemberId, ask: true }).catch(() => null);
  }
  return added !== null;
}
