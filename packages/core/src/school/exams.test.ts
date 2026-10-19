import { describe, expect, it } from "vitest";

import { buildContextItems } from "../context/builders";
import { householdInsights } from "../homebrain/insights";
import { cleanLinks, examEntries, orderExams, periodsOn, type Exam, type TimetablePeriod } from "./exams";

const TZ = "Asia/Kolkata";

const exam = (id: string, papers: [string, string, string | null][], extra: Partial<Exam> = {}): Exam => ({
  id,
  childMemberId: "asmi",
  examType: "Mid-term",
  title: "Term 1",
  notes: null,
  papers: papers.map(([subject, onDate, startsAt], index) => ({ id: `${id}-p${index}`, examId: id, subject, onDate, startsAt, endsAt: startsAt ? "11:00" : null, syllabus: index === 0 ? "Chapters 1-4\nand revision" : null, links: [] })),
  ...extra,
});

describe("a child's exams and timetable (08-015)", () => {
  it("keeps only web addresses as material links, each once, and says which were refused", () => {
    expect(cleanLinks(["https://school.example/maths.pdf", " school.example/maths.pdf ", "https://school.example/maths.pdf", "javascript:alert(1)", "notes", ""])).toEqual({
      links: ["https://school.example/maths.pdf"],
      refused: ["javascript:alert(1)", "notes"],
    });
  });

  it("orders exams still to come soonest first, then the ones that are over", () => {
    const ordered = orderExams([exam("old", [["Maths", "2026-09-01", null]]), exam("later", [["Art", "2026-12-01", null]]), exam("soon", [["Maths", "2026-11-02", null]])], "2026-10-19");
    expect(ordered.map((entry) => entry.id)).toEqual(["soon", "later", "old"]);
  });

  it("puts each paper on the Calendar on its day, timed on the household's clock", () => {
    const entries = examEntries([exam("e1", [["Maths", "2026-11-02", "09:00"], ["Science", "2026-11-04", null]])], { memberId: "kunal", timeZone: TZ } as never, { from: "2026-11-01", to: "2026-11-03" });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: "Maths · Mid-term, Term 1", detail: "Chapters 1-4", allDay: false, category: "school", memberIds: ["asmi"], href: "/school?child=asmi#exams-asmi" });
    // 9:00 in Kolkata is 3:30 UTC.
    expect(entries[0]!.start.toISOString()).toBe("2026-11-02T03:30:00.000Z");
  });

  it("lists a day's periods in order", () => {
    const periods: TimetablePeriod[] = [
      { id: "b", childMemberId: "asmi", weekday: 1, startsAt: "08:40", endsAt: "09:20", subject: "English", teacherName: null, room: null },
      { id: "a", childMemberId: "asmi", weekday: 1, startsAt: "08:00", endsAt: "08:40", subject: "Maths", teacherName: "Mr Iyer", room: null },
      { id: "c", childMemberId: "manan", weekday: 1, startsAt: "08:00", endsAt: "08:40", subject: "Art", teacherName: null, room: null },
    ];
    expect(periodsOn(periods, "asmi", 1).map((period) => period.subject)).toEqual(["Maths", "English"]);
  });

  it("tells HomeBrain each paper and each school day, and an evening plan the night before a paper is noticed", () => {
    const now = new Date("2026-10-29T06:00:00Z");
    const items = buildContextItems(
      {
        members: [
          { id: "asmi", displayName: "Asmi", memberType: "child", status: "active", roles: [], isOwner: false } as never,
          { id: "kunal", displayName: "Kunal", memberType: "adult", status: "active", roles: ["head"], isOwner: true } as never,
        ],
        exams: [exam("e1", [["Maths", "2026-11-02", "09:00"]])],
        timetable: [{ id: "a", childMemberId: "asmi", weekday: 1, startsAt: "08:00", endsAt: "08:40", subject: "Maths", teacherName: "Mr Iyer", room: null }],
        events: [
          { id: "movie", title: "Movie night", kind: "family_time", startsAt: new Date("2026-11-01T13:30:00Z"), endsAt: new Date("2026-11-01T16:00:00Z"), protected: false, ownerMemberId: null, status: "confirmed", actionState: null, actionDueAt: null, participants: [{ memberId: "asmi", response: "yes", required: true }] } as never,
        ],
      },
      { householdId: "hh", householdName: "Mehta Home", timezone: TZ, now, viewerMemberId: "kunal" },
    );
    const paper = items.find((item) => item.entityType === "exam_paper");
    expect(paper?.summary).toBe("Asmi has the Maths paper of the Mid-term (Term 1) on Mon 2 Nov at 9:00am to 11:00am. It covers: Chapters 1-4 and revision.");
    expect(items.find((item) => item.entityType === "timetable_day")?.summary).toBe("On Mondays, Asmi's school timetable is: 8:00am Maths with Mr Iyer.");
    const noticed = householdInsights(items, { timezone: TZ, today: "2026-10-29" }).filter((insight) => insight.rule === "night_before");
    expect(noticed.map((insight) => insight.statement)).toEqual(["Movie night on Sunday evening is the night before Asmi's Maths paper of the Mid-term on Monday."]);
  });
});
