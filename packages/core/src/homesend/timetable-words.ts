import type { Translate } from "../i18n/translate";
import type { SyllabusAttached } from "./syllabus-apply";
import type { TimetableAdded } from "./timetable-apply";

/**
 * What WonderHome says after an exam timetable is read (2026-11-21, the owner:
 * "replies being recieved are confusing"), in this order: what it took it to
 * be; what it did (how many exam days, for whom, in which class; on WhatsApp
 * no dates, per the reply rule in `docs/external-providers.md`); the one
 * question it needs answered, if any; and where to see or undo it.
 */
export function timetableReply(added: TimetableAdded, t: Translate, options: { origin: string; dates?: (iso: string) => string }): string {
  const lines = [t("whatsapp.timetable.lead", { title: added.title ?? t("whatsapp.timetable.untitled") })];
  for (const child of added.children) {
    lines.push(
      options.dates
        ? t("whatsapp.timetable.addedDates", { count: child.count, name: child.name, column: child.column, from: options.dates(child.from), to: options.dates(child.to) })
        : t("whatsapp.timetable.added", { count: child.count, name: child.name, column: child.column }),
    );
  }
  // A revised timetable for an exam on record: updated in place, never a second exam (2026-11-21).
  for (const child of added.revised ?? []) lines.push(t("whatsapp.syllabus.moved", { name: child.name, exam: added.title ?? t("whatsapp.timetable.untitled"), subjects: [...child.moved, ...child.added].join(", ") }));
  if ((added.children.length > 0 || (added.revised?.length ?? 0) > 0) && added.checking) lines.push(t("whatsapp.timetable.checking"));
  // A syllabus kept before this timetable came: now on its exam's papers.
  for (const syllabus of added.syllabi ?? []) lines.push(...syllabusLines(syllabus, t));
  for (const child of added.asked) lines.push(t("whatsapp.timetable.ask", { name: child.name }));
  const first = added.children[0] ?? added.revised?.[0];
  const link = first ? `${options.origin}/school?child=${first.memberId}#exams` : `${options.origin}/ai`;
  lines.push(t(first ? "whatsapp.timetable.open" : "whatsapp.timetable.answer", { link }));
  return lines.join("\n");
}

/** What was done with one exam's syllabus: whose exam, which subjects, what had no paper. Never a date, a mark or a score. */
function syllabusLines(attached: SyllabusAttached, t: Translate): string[] {
  const lines = [
    attached.grade
      ? t("whatsapp.syllabus.lead", { name: attached.childName, exam: attached.examName, grade: attached.grade })
      : t("whatsapp.syllabus.leadPlain", { name: attached.childName, exam: attached.examName }),
  ];
  if (attached.unchanged) lines.push(t("whatsapp.syllabus.same"));
  else if (attached.updated.length > 0) {
    const revision = attached.revised.length === attached.updated.length;
    lines.push(t(revision ? "whatsapp.syllabus.revised" : "whatsapp.syllabus.added", { count: attached.updated.length, subjects: attached.updated.join(", ") }));
  }
  if (attached.unmatched.length > 0) lines.push(t("whatsapp.syllabus.unmatched", { subjects: attached.unmatched.join(", ") }));
  return lines;
}

/**
 * What WonderHome says after a syllabus is matched to an exam on record
 * (2026-11-21): whose exam and which class, the subjects it added what to
 * study to (or that nothing changed), any subject with no paper, Checking
 * when below the bar, and the exam's own link. Never "Nothing in it has a
 * date": it went on the exam, not into notes.
 */
export function syllabusReply(attached: readonly SyllabusAttached[], t: Translate, options: { origin: string }): string {
  const lines = attached.flatMap((one) => syllabusLines(one, t));
  if (attached.some((one) => one.checking && !one.unchanged)) lines.push(t("whatsapp.timetable.checking"));
  const first = attached[0]!;
  lines.push(t("whatsapp.timetable.open", { link: `${options.origin}/school?child=${first.childMemberId}#exams-${first.childMemberId}` }));
  return lines.join("\n");
}
