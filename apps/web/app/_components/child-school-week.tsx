import { CalendarClock, ExternalLink, NotebookPen } from "lucide-react";

import { isoDateIn } from "@wonderhome/core/context/format";
import { requestT } from "@wonderhome/core/i18n/request";
import { periodsOn, type Exam, type TimetablePeriod } from "@wonderhome/core/school/exams";
import { Card } from "@wonderhome/core/ui/card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { formatDate } from "../_lib/session";
import { ExamSheet, PaperSheet, PeriodSheet, RemoveSchoolRecord, type SchoolWeekWords } from "../school/school-week-sheets";

/**
 * A child's school timetable and exams (story 08-015), on Kids & School.
 *
 * - **The week** is one folded row per school day (rule 21): the day and its
 *   subjects in order; opened, each period with its time, teacher and room,
 *   each changed or removed in place.
 * - **Exams** are one folded row each: the kind of exam, its dates and
 *   subjects; opened, every subject on its day and time with what it covers
 *   and its links, each added, changed or removed. Each subject is on the
 *   Calendar on its day (`examEntries`).
 *
 * Rendered outside any form: its sheets carry their own.
 */
export function ChildSchoolWeek({
  householdId,
  child,
  periods,
  exams,
  canChange,
  words,
  timezone,
  language,
}: {
  householdId: string;
  child: { id: string; name: string };
  periods: readonly TimetablePeriod[];
  exams: readonly Exam[];
  canChange: boolean;
  words: SchoolWeekWords;
  timezone: string;
  language: string;
}) {
  const t = requestT();
  const clock = new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const clockOf = (time: string) => clock.format(Date.UTC(2026, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3, 5))));
  const span = (starts: string | null, ends: string | null) => (starts ? (ends ? `${clockOf(starts)} – ${clockOf(ends)}` : clockOf(starts)) : null);
  const dateWord = (dateKey: string) => formatDate(timezone, new Date(`${dateKey}T12:00:00Z`), "long");
  const today = isoDateIn(new Date(), timezone);
  const theirs = periods.filter((period) => period.childMemberId === child.id);
  const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, periods: periodsOn(theirs, child.id, weekday) })).filter((day) => day.periods.length > 0);
  const typeName = (exam: Exam) => words.exams.typeLabels[exam.examType] ?? exam.examType;
  const examName = (exam: Exam) => (exam.title ? `${typeName(exam)} · ${exam.title}` : typeName(exam));
  const hostOf = (link: string) => {
    try {
      return new URL(link).hostname.replace(/^www\./, "");
    } catch {
      return link;
    }
  };

  return (
    <>
      <Card className="px-3 pb-1">
        <p className="pt-3 pb-1 text-sm font-semibold">{t("school.timetable.title")}</p>
        {days.length === 0 ? (
          <p className="pb-2 text-xs text-[var(--wh-foreground-subtle)]">{t("school.timetable.none", { name: child.name })}</p>
        ) : (
          <ul className="space-y-1">
            {days.map((day) => (
              <ExpandableRow
                key={day.weekday}
                summary={
                  <>
                    <IconTile icon={CalendarClock} tone="school" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{words.dayNames[day.weekday - 1]}</span>
                      <span className="block text-xs text-[var(--wh-foreground-muted)]">{day.periods.map((period) => period.subject).join(" · ")}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{span(day.periods[0]!.startsAt, day.periods.at(-1)!.endsAt)}</span>
                    </span>
                  </>
                }
              >
                <ul className="divide-y divide-[var(--wh-border)] px-2 pb-2">
                  {day.periods.map((period) => (
                    <li key={period.id} className="flex items-start gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{period.subject}</span>
                        <span className="block text-xs text-[var(--wh-foreground-muted)]">{[span(period.startsAt, period.endsAt), period.teacherName, period.room].filter(Boolean).join(" · ")}</span>
                      </span>
                      {canChange ? (
                        <span className="flex items-center gap-1">
                          <PeriodSheet householdId={householdId} child={child} period={period} words={words} />
                          <RemoveSchoolRecord kind="period" householdId={householdId} id={period.id} label={words.timetable.remove.replaceAll("{name}", period.subject)} />
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {canChange ? (
                  <div className="px-2 pb-2">
                    <PeriodSheet householdId={householdId} child={child} weekday={day.weekday} words={words} />
                  </div>
                ) : null}
              </ExpandableRow>
            ))}
          </ul>
        )}
        {canChange && days.length === 0 ? <PeriodSheet householdId={householdId} child={child} words={words} /> : null}
      </Card>

      <Card className="px-3 pb-1" id={`exams-${child.id}`}>
        <p className="pt-3 pb-1 text-sm font-semibold">{t("school.exams.title")}</p>
        {exams.length === 0 ? (
          <p className="pb-2 text-xs text-[var(--wh-foreground-subtle)]">{t("school.exams.none")}</p>
        ) : (
          <ul className="space-y-1">
            {exams.map((exam) => {
              const over = exam.papers.length > 0 && exam.papers.at(-1)!.onDate < today;
              const dates = exam.papers.length === 0 ? t("school.exams.noPapers") : exam.papers.length === 1 ? dateWord(exam.papers[0]!.onDate) : `${dateWord(exam.papers[0]!.onDate)} – ${dateWord(exam.papers.at(-1)!.onDate)}`;
              return (
                <ExpandableRow
                  key={exam.id}
                  summary={
                    <>
                      <IconTile icon={NotebookPen} tone={over ? "home" : "school"} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{examName(exam)}</span>
                        {exam.papers.length > 0 ? <span className="block text-xs text-[var(--wh-foreground-muted)]">{exam.papers.map((paper) => paper.subject).join(" · ")}</span> : null}
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">{over ? `${t("school.exams.over")} · ${dates}` : dates}</span>
                      </span>
                    </>
                  }
                >
                  <div className="space-y-3 px-2 pb-3 text-sm">
                    {exam.notes ? <p className="whitespace-pre-line text-[var(--wh-foreground-muted)]">{exam.notes}</p> : null}
                    <ul className="divide-y divide-[var(--wh-border)]">
                      {exam.papers.map((paper) => (
                        <li key={paper.id} className="space-y-1 py-2">
                          <div className="flex items-start gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{paper.subject}</span>
                              <span className="block text-xs text-[var(--wh-foreground-muted)]">{[dateWord(paper.onDate), span(paper.startsAt, paper.endsAt)].filter(Boolean).join(" · ")}</span>
                            </span>
                            {canChange ? (
                              <span className="flex items-center gap-1">
                                <PaperSheet householdId={householdId} exam={{ id: exam.id, name: examName(exam) }} paper={paper} words={words} />
                                <RemoveSchoolRecord kind="paper" householdId={householdId} id={paper.id} label={words.paper.remove.replaceAll("{name}", paper.subject)} />
                              </span>
                            ) : null}
                          </div>
                          {paper.syllabus ? (
                            <p className="whitespace-pre-line text-xs text-[var(--wh-foreground-muted)]">
                              <span className="font-semibold text-[var(--wh-foreground)]">{t("school.exams.paper.covers")}: </span>
                              {paper.syllabus}
                            </p>
                          ) : null}
                          {paper.links.length > 0 ? (
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <span className="font-semibold">{t("school.exams.paper.material")}:</span>
                              {paper.links.map((link) => (
                                <a key={link} href={link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-semibold break-all text-[var(--wh-primary)]">
                                  {hostOf(link)} <ExternalLink aria-hidden className="size-3" />
                                </a>
                              ))}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {canChange ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <PaperSheet householdId={householdId} exam={{ id: exam.id, name: examName(exam) }} words={words} />
                        <span className="ml-auto flex items-center gap-1">
                          <ExamSheet householdId={householdId} child={child} exam={exam} words={words} />
                          <RemoveSchoolRecord kind="exam" householdId={householdId} id={exam.id} label={words.exams.remove.replaceAll("{name}", examName(exam))} />
                        </span>
                      </div>
                    ) : null}
                  </div>
                </ExpandableRow>
              );
            })}
          </ul>
        )}
        {canChange ? <ExamSheet householdId={householdId} child={child} words={words} /> : null}
      </Card>
    </>
  );
}
