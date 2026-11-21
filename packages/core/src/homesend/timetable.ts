import type { IntakeSchedule } from "../ai/classify-intake";

/**
 * A dated table by class (2026-11-21: the owner's Mid-Term Unit Test 2
 * timetable, Std. III–VII side by side) turned into each child's own exam
 * days. Pure: the model only copies the table (`classify-intake.ts`
 * `schedule`); which column is a child's is decided here, from the class on
 * the child's school record, and a date is only ever one the table wrote.
 *
 *   - "Std. IV", "Grade 4", "Class IV", "4th", "IV" and "4" are the same class;
 *     a section ("V-B") narrows it only when both sides name one.
 *   - A row with no subject in a child's column (a weekend, a holiday, a
 *     shaded line) adds nothing for that child.
 *   - A child at the school whose class isn't on record is not guessed: the
 *     caller asks "Which class is <child> in?" with the columns as answers.
 *   - "a reading naming something not in what was sent adds nothing": a cell
 *     or date that isn't in the table never becomes an entry.
 */

export type TimetableChild = { memberId: string; name: string; grade: string | null; school: string | null };

export type TimetablePaper = { subject: string; onDate: string };

export type TimetablePlan = {
  title: string | null;
  /** One of the app's exam types (`school/exams.ts` DEFAULT_EXAM_TYPES), from the table's own name. */
  examType: "Unit test" | "Mid-term" | "Finals";
  /** Each child whose column was found, with that column's exam days, earliest first. */
  children: { memberId: string; name: string; column: string; papers: TimetablePaper[] }[];
  /** Children at the school whose class isn't on record: asked, never guessed. */
  needClass: { memberId: string; name: string }[];
  columns: string[];
};

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

/** "Std. IV-B" → { grade: 4, section: "B" }; "Grade 10" → { grade: 10, section: null }; anything else → grade null. */
export function classOf(label: string | null | undefined): { grade: number | null; section: string | null } {
  if (!label) return { grade: null, section: null };
  const text = label
    .toLowerCase()
    .replace(/\b(std|standard|class|grade|gr|year|yr|form)\b\.?/g, " ")
    .replace(/[()]/g, " ")
    .trim();
  const match = /^([0-9]{1,2}|[ivx]{1,4})(?:st|nd|rd|th)?(?:\s*[-/ ]?\s*([a-z]))?\b/.exec(text.replace(/\s+/g, " "));
  if (!match) return { grade: null, section: null };
  const raw = match[1]!;
  const grade = /^\d+$/.test(raw) ? Number(raw) : (ROMAN[raw] ?? null);
  if (grade === null || grade < 1 || grade > 12) return { grade: null, section: null };
  const section = match[2] && !/^(st|nd|rd|th)$/.test(match[2]) ? match[2].toUpperCase() : null;
  return { grade, section };
}

/** The column that is this class, or null (none, or two that both fit). */
export function columnFor(columns: readonly string[], grade: string | null | undefined): number | null {
  const want = classOf(grade);
  if (want.grade === null) return null;
  const fits = columns
    .map((column, index) => ({ index, have: classOf(column) }))
    .filter(({ have }) => have.grade === want.grade && (!have.section || !want.section || have.section === want.section));
  if (fits.length === 1) return fits[0]!.index;
  // Several sections of the same class: only an exact section match decides.
  const exact = fits.filter(({ have }) => have.section !== null && have.section === want.section);
  return exact.length === 1 ? exact[0]!.index : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function iso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A row's day, from the table only: its full date as the model copied it, or
 * the date written in the row ("03-12-26": day-month-year, as Indian schools
 * write it; "3 December 2026"; "3rd Dec" in the table's own year). Null when
 * the row doesn't say.
 */
export function rowDate(row: IntakeSchedule["rows"][number], tableYear: number | null): string | null {
  const text = row.dateText ?? "";
  const numeric = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(text);
  if (numeric) {
    const year = numeric[3]!.length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return iso(year, Number(numeric[2]), Number(numeric[1]));
  }
  const worded = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?(?:,?\s+(\d{4}))?/i.exec(text);
  if (worded && MONTHS[worded[2]!.toLowerCase()]) {
    const year = worded[3] ? Number(worded[3]) : tableYear;
    if (year) return iso(year, MONTHS[worded[2]!.toLowerCase()]!, Number(worded[1]));
  }
  if (row.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(row.dueDate)) return row.dueDate;
  return null;
}

/** The year the table's own words name ("3rd December – 14th December 2026"), for a row that writes only day and month. */
export function tableYear(schedule: Pick<IntakeSchedule, "title" | "rows">): number | null {
  const words = [schedule.title, ...schedule.rows.map((row) => row.dateText), ...schedule.rows.map((row) => row.dueDate)].join(" ");
  const year = /\b(20\d{2})\b/.exec(words);
  return year ? Number(year[1]) : null;
}

/** An empty, shaded or "no exam" cell is no exam. */
function subjectIn(cell: string | null | undefined): string | null {
  const value = cell?.replace(/\s+/g, " ").trim() ?? "";
  if (!value || /^[-–—.x*/\\]+$/i.test(value)) return null;
  if (/^(no exam|holiday|off|nil|n\/a|na|study leave|preparation leave)$/i.test(value)) return null;
  return value.slice(0, 80);
}

export function examTypeOf(title: string | null): TimetablePlan["examType"] {
  const words = (title ?? "").toLowerCase();
  if (/mid[- ]?term|half[- ]?yearly|mid[- ]?year/.test(words)) return "Mid-term";
  if (/final|annual|end[- ]?(of[- ]?)?(term|year)/.test(words)) return "Finals";
  return "Unit test";
}

function sameSchool(a: string | null, b: string | null): boolean {
  const norm = (value: string | null) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(school|the|international|public|high|centre|center|innovation|cambridge)\b/g, " ").replace(/\s+/g, " ").trim();
  const left = norm(a);
  const right = norm(b);
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

/**
 * Which children it is for, and each one's exam days.
 *
 * Children: those with a school on record. When the table names its school
 * and some of them are at it, only those; otherwise every child with a
 * school. A child whose class picks a column gets that column's days; one
 * whose class is on record but not in the table is not this table's; one
 * with no class on record is `needClass`.
 */
export function planTimetable(schedule: IntakeSchedule, children: readonly TimetableChild[]): TimetablePlan {
  const year = tableYear(schedule);
  const atSchool = children.filter((child) => child.school);
  const named = schedule.school ? atSchool.filter((child) => sameSchool(child.school, schedule.school)) : [];
  const candidates = named.length > 0 ? named : atSchool;
  const plan: TimetablePlan = { title: schedule.title, examType: examTypeOf(schedule.title), children: [], needClass: [], columns: [...schedule.columns] };
  for (const child of candidates) {
    if (!classOf(child.grade).grade) {
      plan.needClass.push({ memberId: child.memberId, name: child.name });
      continue;
    }
    const column = columnFor(schedule.columns, child.grade);
    if (column === null) continue;
    const papers = papersIn(schedule, column, year);
    if (papers.length > 0) plan.children.push({ memberId: child.memberId, name: child.name, column: schedule.columns[column]!, papers });
  }
  return plan;
}

/** One column's exam days: a written subject on a written date, earliest first, one per day and subject. */
export function papersIn(schedule: IntakeSchedule, column: number, year = tableYear(schedule)): TimetablePaper[] {
  const seen = new Set<string>();
  const papers: TimetablePaper[] = [];
  for (const row of schedule.rows) {
    const subject = subjectIn(row.cells[column]);
    const onDate = rowDate(row, year);
    if (!subject || !onDate) continue;
    const key = `${onDate}|${subject.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    papers.push({ subject, onDate });
  }
  return papers.sort((a, b) => a.onDate.localeCompare(b.onDate));
}
