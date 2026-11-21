import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { atLocal } from "../calendar/dates";
import type { CalendarEntry, CalendarViewer } from "../calendar/projection";
import { invalidatesContext } from "../context/invalidation";
import type { FamilyEvent } from "../family/schedule";

/**
 * A child's school timetable and exams (story 08-015):
 * `school_timetable_periods`, `school_exam_types`, `school_exams` and
 * `school_exam_papers`. The child, their guardians and Admins read them;
 * guardians and Admins change them (RLS), and any adult may add an exam type
 * of the household's own. Nothing is hard-deleted: a period, an exam or a
 * paper is stood down (rule 12). Each exam paper is on the Calendar on its
 * day (`examEntries`), read live, never copied into `family_events`.
 */

/** The exam types the app offers before a household adds its own (rule 20: a picker, with its own way to add one). */
export const DEFAULT_EXAM_TYPES = ["Unit test", "Mid-term", "Finals"] as const;

/** A paper links to at most this many pieces of material. */
export const MAX_EXAM_LINKS = 10;

export type TimetablePeriod = {
  id: string;
  childMemberId: string;
  /** ISO weekday: 1 Monday … 7 Sunday. */
  weekday: number;
  /** "HH:MM" on the household's clock. */
  startsAt: string;
  endsAt: string;
  subject: string;
  teacherName: string | null;
  room: string | null;
};

export type ExamType = { id: string; name: string };

export type ExamPaper = {
  id: string;
  examId: string;
  subject: string;
  onDate: string;
  startsAt: string | null;
  endsAt: string | null;
  syllabus: string | null;
  /** The paper's maximum marks, when known ("20 Mks" in a syllabus). Null until the 2026-11-21 migration is live. */
  maxMarks: number | null;
  links: string[];
};

export type Exam = {
  id: string;
  childMemberId: string;
  examType: string;
  title: string | null;
  notes: string | null;
  /** Its subjects, by day and time. */
  papers: ExamPaper[];
};

type Row = Record<string, unknown>;
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const hhmm = (value: unknown): string | null => (typeof value === "string" && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : null);

const PERIOD_COLUMNS = "id, child_member_id, weekday, starts_at, ends_at, subject, teacher_name, room";
const EXAM_COLUMNS = "id, child_member_id, exam_type, title, notes";
const PAPER_COLUMNS = "id, exam_id, subject, on_date, starts_at, ends_at, syllabus, links";
const PAPER_COLUMNS_WITH_MARKS = `${PAPER_COLUMNS}, max_marks`;

/** Postgres "undefined column" or PostgREST "column not in schema cache": the max-marks migration isn't live yet (safe in either order). */
const missingColumn = (error: { code?: string } | null) => error?.code === "42703" || error?.code === "PGRST204";

function toPeriod(row: Row): TimetablePeriod {
  return {
    id: row.id as string,
    childMemberId: row.child_member_id as string,
    weekday: Number(row.weekday),
    startsAt: hhmm(row.starts_at) ?? "00:00",
    endsAt: hhmm(row.ends_at) ?? "00:00",
    subject: row.subject as string,
    teacherName: text(row.teacher_name),
    room: text(row.room),
  };
}

function toPaper(row: Row): ExamPaper {
  return {
    id: row.id as string,
    examId: row.exam_id as string,
    subject: row.subject as string,
    onDate: row.on_date as string,
    startsAt: hhmm(row.starts_at),
    endsAt: hhmm(row.ends_at),
    syllabus: text(row.syllabus),
    maxMarks: typeof row.max_marks === "number" ? row.max_marks : null,
    links: Array.isArray(row.links) ? (row.links as unknown[]).filter((link): link is string => typeof link === "string") : [],
  };
}

/** Every current period of the children this viewer may see, in the order of the week. */
export async function listTimetable(supabase: SupabaseClient, householdId: string): Promise<TimetablePeriod[]> {
  const { data, error } = await supabase
    .from("school_timetable_periods")
    .select(PERIOD_COLUMNS)
    .eq("household_id", householdId)
    .eq("active", true)
    .order("weekday")
    .order("starts_at");
  if (error) throw new Error(`listTimetable failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map(toPeriod);
}

/** The app's exam types, then the household's own, each once. */
export async function listExamTypes(supabase: SupabaseClient, householdId: string): Promise<{ builtIn: string[]; own: ExamType[] }> {
  const { data, error } = await supabase.from("school_exam_types").select("id, name").eq("household_id", householdId).eq("active", true).order("name");
  if (error) throw new Error(`listExamTypes failed: ${error.code ?? "unknown"}`);
  const builtIn = new Set(DEFAULT_EXAM_TYPES.map((name) => name.toLowerCase()));
  const own = ((data ?? []) as Row[]).map((row) => ({ id: row.id as string, name: row.name as string })).filter((type) => !builtIn.has(type.name.toLowerCase()));
  return { builtIn: [...DEFAULT_EXAM_TYPES], own };
}

/** Every current exam, each with its current papers in date order; exams with the soonest paper first. */
export async function listExams(supabase: SupabaseClient, householdId: string): Promise<Exam[]> {
  const { data, error } = await supabase.from("school_exams").select(EXAM_COLUMNS).eq("household_id", householdId).eq("active", true);
  if (error) throw new Error(`listExams failed: ${error.code ?? "unknown"}`);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];
  const readPapers = (columns: string) =>
    supabase
      .from("school_exam_papers")
      .select(columns)
      .eq("household_id", householdId)
      .eq("active", true)
      .in(
        "exam_id",
        rows.map((row) => row.id as string),
      )
      .order("on_date")
      .order("starts_at", { nullsFirst: true });
  let { data: papers, error: paperError } = await readPapers(PAPER_COLUMNS_WITH_MARKS);
  if (missingColumn(paperError)) ({ data: papers, error: paperError } = await readPapers(PAPER_COLUMNS));
  if (paperError) throw new Error(`listExams failed: ${paperError.code ?? "unknown"}`);
  const byExam = new Map<string, ExamPaper[]>();
  for (const paper of ((papers ?? []) as unknown as Row[]).map(toPaper)) byExam.set(paper.examId, [...(byExam.get(paper.examId) ?? []), paper]);
  const exams = rows.map((row) => ({
    id: row.id as string,
    childMemberId: row.child_member_id as string,
    examType: row.exam_type as string,
    title: text(row.title),
    notes: text(row.notes),
    papers: byExam.get(row.id as string) ?? [],
  }));
  return orderExams(exams);
}

/** Exams with a paper still to come first, soonest first; then the ones that are over, most recent first. */
export function orderExams<T extends Pick<Exam, "papers">>(exams: readonly T[], today: string = new Date().toISOString().slice(0, 10)): T[] {
  const first = (exam: T) => exam.papers[0]?.onDate ?? "9999-12-31";
  const last = (exam: T) => exam.papers.at(-1)?.onDate ?? "0000-01-01";
  const upcoming = exams.filter((exam) => exam.papers.length === 0 || last(exam) >= today).sort((a, b) => first(a).localeCompare(first(b)));
  const past = exams.filter((exam) => exam.papers.length > 0 && last(exam) < today).sort((a, b) => last(b).localeCompare(last(a)));
  return [...upcoming, ...past];
}

function refused(error: { code?: string } | null, what: string): never {
  if (error?.code === "42501") throw ApiError.forbidden("Only the child's guardians or an Admin can change this.");
  if (error?.code === "23505") throw ApiError.conflict("That one is already on the list.");
  if (error?.code === "23514") throw ApiError.badRequest("Please check the details above.");
  throw new Error(`${what} failed: ${error?.code ?? "unknown"}`);
}

/**
 * Material links as they are kept: trimmed, web addresses only, each once,
 * at most ten. A link with no scheme is read as https; anything else (a
 * `javascript:` or a file path) is refused rather than dropped, so the
 * person knows which one did not go in.
 */
export function cleanLinks(raw: readonly string[]): { links: string[]; refused: string[] } {
  const links: string[] = [];
  const refusedLinks: string[] = [];
  for (const entry of raw) {
    const value = entry.trim();
    if (!value) continue;
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    let url: URL | null = null;
    try {
      url = new URL(candidate);
    } catch {
      url = null;
    }
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname.includes(".") || candidate.length > 500 || /\s/.test(candidate)) {
      refusedLinks.push(value);
      continue;
    }
    if (!links.includes(url.toString())) links.push(url.toString());
  }
  return { links: links.slice(0, MAX_EXAM_LINKS), refused: refusedLinks };
}

export type PeriodInput = {
  householdId: string;
  childMemberId: string;
  id?: string | null;
  weekday: number;
  startsAt: string;
  endsAt: string;
  subject: string;
  teacherName?: string | null;
  room?: string | null;
};

async function savePeriodImpl(supabase: SupabaseClient, input: PeriodInput): Promise<{ id: string }> {
  const subject = input.subject.trim().slice(0, 80);
  if (!subject) throw ApiError.badRequest("Which subject is it?");
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) throw ApiError.badRequest("Which day is it?");
  if (input.startsAt >= input.endsAt) throw ApiError.badRequest("A period has to end after it starts.");
  const row = {
    household_id: input.householdId,
    child_member_id: input.childMemberId,
    weekday: input.weekday,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    subject,
    teacher_name: input.teacherName?.trim().slice(0, 120) || null,
    room: input.room?.trim().slice(0, 60) || null,
  };
  const query = input.id
    ? supabase.from("school_timetable_periods").update(row).eq("id", input.id).eq("household_id", input.householdId).select("id").single()
    : supabase.from("school_timetable_periods").insert(row).select("id").single();
  const { data, error } = await query;
  if (error || !data) refused(error, "savePeriod");
  return { id: (data as Row).id as string };
}

async function addExamTypeImpl(supabase: SupabaseClient, input: { householdId: string; name: string }): Promise<{ name: string }> {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!name) throw ApiError.badRequest("What is the exam called?");
  // One the app already offers is not a new type.
  const builtIn = DEFAULT_EXAM_TYPES.find((type) => type.toLowerCase() === name.toLowerCase());
  if (builtIn) return { name: builtIn };
  const { error } = await supabase.from("school_exam_types").insert({ household_id: input.householdId, name });
  if (error && error.code !== "23505") refused(error, "addExamType");
  return { name };
}

export type ExamInput = {
  householdId: string;
  childMemberId: string;
  id?: string | null;
  examType: string;
  title?: string | null;
  notes?: string | null;
};

async function saveExamImpl(supabase: SupabaseClient, input: ExamInput): Promise<{ id: string }> {
  const examType = input.examType.trim().slice(0, 60);
  if (!examType) throw ApiError.badRequest("Which kind of exam is it?");
  const row = {
    household_id: input.householdId,
    child_member_id: input.childMemberId,
    exam_type: examType,
    title: input.title?.trim().slice(0, 120) || null,
    notes: input.notes?.trim().slice(0, 2000) || null,
  };
  const query = input.id
    ? supabase.from("school_exams").update(row).eq("id", input.id).eq("household_id", input.householdId).select("id").single()
    : supabase.from("school_exams").insert(row).select("id").single();
  const { data, error } = await query;
  if (error || !data) refused(error, "saveExam");
  return { id: (data as Row).id as string };
}

export type PaperInput = {
  householdId: string;
  examId: string;
  id?: string | null;
  subject: string;
  onDate: string;
  startsAt: string | null;
  endsAt: string | null;
  syllabus?: string | null;
  /** Left as it is when absent. */
  maxMarks?: number | null;
  links: string[];
};

async function savePaperImpl(supabase: SupabaseClient, input: PaperInput): Promise<{ id: string }> {
  const subject = input.subject.trim().slice(0, 80);
  if (!subject) throw ApiError.badRequest("Which subject is it?");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.onDate)) throw ApiError.badRequest("On which day is it?");
  if (input.startsAt && input.endsAt && input.startsAt >= input.endsAt) throw ApiError.badRequest("It has to end after it starts.");
  const { links, refused: badLinks } = cleanLinks(input.links);
  if (badLinks.length > 0) throw ApiError.badRequest(`"${badLinks[0]}" is not a web address.`);
  const row = {
    household_id: input.householdId,
    exam_id: input.examId,
    subject,
    on_date: input.onDate,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    syllabus: input.syllabus?.trim().slice(0, 4000) || null,
    links,
  };
  if (input.maxMarks !== undefined && input.maxMarks !== null && (!Number.isInteger(input.maxMarks) || input.maxMarks < 1 || input.maxMarks > 1000)) {
    throw ApiError.badRequest("Max marks is a whole number from 1 to 1000.");
  }
  const write = (values: Record<string, unknown>) =>
    input.id
      ? supabase.from("school_exam_papers").update(values).eq("id", input.id).eq("household_id", input.householdId).select("id").single()
      : supabase.from("school_exam_papers").insert(values).select("id").single();
  let { data, error } = await write(input.maxMarks === undefined ? row : { ...row, max_marks: input.maxMarks });
  // Before the max-marks migration is live the paper is still saved, without its marks.
  if (input.maxMarks !== undefined && missingColumn(error)) ({ data, error } = await write(row));
  if (error || !data) refused(error, "savePaper");
  return { id: (data as Row).id as string };
}

const STAND_DOWN_TABLES = { period: "school_timetable_periods", exam: "school_exams", paper: "school_exam_papers", examType: "school_exam_types" } as const;

async function standDownImpl(supabase: SupabaseClient, input: { householdId: string; id: string; kind: keyof typeof STAND_DOWN_TABLES }): Promise<void> {
  const { data, error } = await supabase.from(STAND_DOWN_TABLES[input.kind]).update({ active: false }).eq("id", input.id).eq("household_id", input.householdId).select("id");
  if (error) refused(error, "standDown");
  if ((data ?? []).length === 0) throw ApiError.forbidden("Only the child's guardians or an Admin can change this.");
}

export const savePeriod = invalidatesContext(savePeriodImpl, (_s, input) => input.householdId);
export const addExamType = invalidatesContext(addExamTypeImpl, (_s, input) => input.householdId);
export const saveExam = invalidatesContext(saveExamImpl, (_s, input) => input.householdId);
export const savePaper = invalidatesContext(savePaperImpl, (_s, input) => input.householdId);
export const standDownSchoolRecord = invalidatesContext(standDownImpl, (_s, input) => input.householdId);

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * Exam papers as Calendar entries (08-015): one per paper in the range, at
 * its times on the household's clock, or all day when no time was given.
 * They are the exam's, not events: opening one goes to Kids & School.
 */
export function examEntries(exams: readonly Exam[], viewer: CalendarViewer, range: { from: string; to: string }): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const exam of exams) {
    for (const paper of exam.papers) {
      if (paper.onDate < range.from || paper.onDate > range.to) continue;
      const timed = Boolean(paper.startsAt);
      const start = atLocal(paper.onDate, timed ? minutesOf(paper.startsAt!) : 0, viewer.timeZone);
      const end = timed
        ? paper.endsAt
          ? atLocal(paper.onDate, minutesOf(paper.endsAt), viewer.timeZone)
          : new Date(start.getTime() + 60 * 60_000)
        : atLocal(paper.onDate, 24 * 60, viewer.timeZone);
      entries.push({
        id: `exam:${paper.id}`,
        source: "school",
        sourceId: paper.id,
        title: paperTitle(exam, paper),
        detail: paper.syllabus ? paper.syllabus.split("\n")[0]!.slice(0, 120) : null,
        start,
        end,
        allDay: !timed,
        timeZone: viewer.timeZone,
        kind: "block",
        category: "school",
        memberIds: [exam.childMemberId],
        ownerMemberId: null,
        status: "confirmed",
        visibility: "participants",
        occurrenceDate: paper.onDate,
        repeats: false,
        protected: false,
        href: examHref(exam),
        can: { edit: false },
      });
    }
  }
  return entries;
}

/** Where an exam opens: the child's exams in Kids & School, the paper's own editor (rule 23). */
export function examHref(exam: Pick<Exam, "childMemberId">): string {
  return `/school?child=${exam.childMemberId}#exams-${exam.childMemberId}`;
}

/** "Science · Mid-term, Mid-Term Unit Test 2": the subject, then which exam. */
export function paperTitle(exam: Pick<Exam, "examType" | "title">, paper: Pick<ExamPaper, "subject">): string {
  return `${paper.subject} · ${exam.title ? `${exam.examType}, ${exam.title}` : exam.examType}`;
}

/**
 * Exam papers as the household's events (2026-11-21, the owner: "it doesn't
 * create an event for science on 3rd dec"): wherever a screen lists events
 * (Home's upcoming and today, a child's home, the Calendar's Today plan, the
 * Family page, HomeTalk's "what's on"), each paper is there too, as the
 * child's all-day (or timed) school event, read live from the exam, so it is
 * one thing, shown once, with one editor. It opens the exam in Kids & School
 * (`href`), never a second copy in `family_events`; its reminders stay the
 * exam's (`notifications/sources.ts` `examPaperSubject`).
 */
export function examPaperEvents(exams: readonly Exam[], timeZone: string, window: { from?: Date; to?: Date } = {}): FamilyEvent[] {
  const events: FamilyEvent[] = [];
  for (const exam of exams) {
    for (const paper of exam.papers) {
      const timed = Boolean(paper.startsAt);
      const startsAt = atLocal(paper.onDate, timed ? minutesOf(paper.startsAt!) : 0, timeZone);
      const endsAt = timed
        ? paper.endsAt
          ? atLocal(paper.onDate, minutesOf(paper.endsAt), timeZone)
          : new Date(startsAt.getTime() + 60 * 60_000)
        : atLocal(paper.onDate, 24 * 60, timeZone);
      if (window.from && endsAt < window.from) continue;
      if (window.to && startsAt > window.to) continue;
      events.push({
        id: `exam-${paper.id}`,
        title: paperTitle(exam, paper),
        kind: "school_event",
        startsAt,
        endsAt,
        protected: false,
        ownerMemberId: null,
        status: "confirmed",
        actionState: null,
        actionDueAt: null,
        participants: [{ memberId: exam.childMemberId, response: "yes", required: true }],
        allDay: !timed,
        location: null,
        sourceSubscriptionId: null,
        href: examHref(exam),
        detail: paper.syllabus ? paper.syllabus.split("\n")[0]!.slice(0, 120) : null,
        examPaperId: paper.id,
      });
    }
  }
  return events;
}

/** A child's periods for one weekday, in order. */
export function periodsOn(periods: readonly TimetablePeriod[], childMemberId: string, weekday: number): TimetablePeriod[] {
  return periods.filter((period) => period.childMemberId === childMemberId && period.weekday === weekday).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
