import { describe, expect, it } from "vitest";

import {
  assessDeadline,
  childView,
  estimateMinutes,
  mergeFromProvider,
  planStudy,
  upcomingSchoolItems,
  type SchoolItem,
} from "./items";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const item = (over: Partial<SchoolItem> = {}): SchoolItem => ({
  id: "hw-1",
  childMemberId: "aarav",
  kind: "homework",
  title: "Maths worksheet",
  subject: "Maths",
  detail: null,
  dueAt: new Date("2026-09-18T08:00:00.000Z"),
  estimatedMinutes: null,
  estimateSource: null,
  status: "pending",
  completedAt: null,
  provider: null,
  externalId: null,
  ...over,
});

describe("estimating effort", () => {
  it("uses what the household or provider said, and keeps the source", () => {
    const stated = item({ estimatedMinutes: 45, estimateSource: "member_confirmed" });

    expect(estimateMinutes(stated, "older_child")).toEqual({ minutes: 45, source: "member_confirmed" });
  });

  it("guesses when nobody has said, and says that it guessed", () => {
    expect(estimateMinutes(item(), "teen")).toEqual({ minutes: 30, source: "inferred" });
  });

  it("allows a younger child longer for the same work", () => {
    expect(estimateMinutes(item(), "young_child").minutes).toBeGreaterThan(
      estimateMinutes(item(), "teen").minutes,
    );
  });
});

describe("planning study", () => {
  const evening = [{ start: new Date("2026-09-17T12:00:00.000Z"), end: new Date("2026-09-17T14:00:00.000Z") }];

  it("splits long work into sittings a child of that age can actually manage", () => {
    const project = item({ kind: "project", id: "project-1" });
    const { sessions } = planStudy([project], evening, "young_child");

    expect(sessions.length).toBeGreaterThan(1);
    for (const session of sessions) {
      const minutes = (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000;
      expect(minutes).toBeLessThanOrEqual(20);
    }
  });

  it("never schedules outside the time the child actually has", () => {
    const { sessions } = planStudy([item()], evening, "teen");

    for (const session of sessions) {
      expect(session.startsAt.getTime()).toBeGreaterThanOrEqual(evening[0]!.start.getTime());
      expect(session.endsAt.getTime()).toBeLessThanOrEqual(evening[0]!.end.getTime());
    }
  });

  it("does the nearest deadline first", () => {
    const soon = item({ id: "soon", dueAt: new Date("2026-09-17T18:00:00.000Z") });
    const later = item({ id: "later", dueAt: new Date("2026-09-25T18:00:00.000Z") });

    const { sessions } = planStudy([later, soon], evening, "teen");
    expect(sessions[0]?.schoolItemId).toBe("soon");
  });

  it("reports what will not fit rather than quietly dropping it", () => {
    const tiny = [{ start: new Date("2026-09-17T12:00:00.000Z"), end: new Date("2026-09-17T12:20:00.000Z") }];
    const { unplaced } = planStudy([item({ kind: "project" })], tiny, "teen");

    expect(unplaced.map((entry) => entry.id)).toEqual(["hw-1"]);
  });

  it("proposes rather than commits — a child has not agreed to any of this yet", () => {
    const { sessions } = planStudy([item()], evening, "teen");

    expect(sessions.every((session) => session.source === "proposed")).toBe(true);
  });

  it("leaves notices and events out of a study plan", () => {
    const { sessions } = planStudy([item({ kind: "notice" }), item({ id: "e", kind: "event" })], evening, "teen");

    expect(sessions).toEqual([]);
  });
});

describe("deadline risk", () => {
  it("says nothing about work that fits in the time available", () => {
    const assessment = assessDeadline(item(), {
      now: NOW,
      availableMinutesBeforeDue: 120,
      ageBand: "teen",
    });

    expect(assessment.notable).toBe(false);
  });

  it("speaks up when there is less time than work, not merely when it is near", () => {
    const assessment = assessDeadline(item({ kind: "project" }), {
      now: NOW,
      availableMinutesBeforeDue: 30,
      ageBand: "teen",
    });

    expect(assessment.status).toBe("at_risk");
    expect(assessment.riskLevel).toBe("high");
    expect(assessment.action).toEqual({ action: "make_time", target: "hw-1" });
  });

  it("treats a passed deadline as missed, and asks a person rather than assuming", () => {
    const assessment = assessDeadline(item({ dueAt: new Date("2026-09-16T08:00:00.000Z") }), {
      now: NOW,
      availableMinutesBeforeDue: 0,
      ageBand: "teen",
    });

    expect(assessment.status).toBe("missed");
    expect(assessment.action).toEqual({ action: "check_with_child", target: "hw-1" });
  });

  it("says nothing about finished work", () => {
    const done = item({ status: "done", completedAt: NOW });

    expect(assessDeadline(done, { now: NOW, availableMinutesBeforeDue: 0, ageBand: "teen" }).notable).toBe(
      false,
    );
  });
});

describe("what a provider may change", () => {
  it("updates the facts about the work", () => {
    const merged = mergeFromProvider(item(), {
      title: "Maths worksheet (revised)",
      dueAt: new Date("2026-09-19T08:00:00.000Z"),
    });

    expect(merged.title).toBe("Maths worksheet (revised)");
    expect(merged.dueAt?.toISOString()).toBe("2026-09-19T08:00:00.000Z");
  });

  it("can withdraw work", () => {
    expect(mergeFromProvider(item(), { status: "cancelled" }).status).toBe("cancelled");
  });

  it("cannot mark work done — a quiet portal is not a child saying they finished", () => {
    const merged = mergeFromProvider(item(), { status: "done" as never });

    expect(merged.status).toBe("pending");
    expect(merged.completedAt).toBeNull();
  });

  it("never overwrites a completion the child already recorded", () => {
    const finished = item({ status: "done", completedAt: NOW });
    const merged = mergeFromProvider(finished, { status: "cancelled" });

    expect(merged.status).toBe("done");
    expect(merged.completedAt).toEqual(NOW);
  });

  it("records that an estimate came from the provider rather than from us", () => {
    expect(mergeFromProvider(item(), { estimatedMinutes: 40 }).estimateSource).toBe("provider");
  });
});

describe("the child's own view", () => {
  it("separates today from later, and says something kind either way", () => {
    const view = childView(
      [item(), item({ id: "hw-2", dueAt: new Date("2026-09-17T15:00:00.000Z") })],
      NOW,
    );

    expect(view.today.map((entry) => entry.id)).toEqual(["hw-2"]);
    expect(view.soon.map((entry) => entry.id)).toEqual(["hw-1"]);
    expect(view.encouragement).toContain("One thing");
  });

  it("leaves finished work out entirely", () => {
    const view = childView([item({ status: "done", completedAt: NOW })], NOW);

    expect(view.today).toEqual([]);
    expect(view.soon).toEqual([]);
    expect(view.encouragement).toBe("Nothing due today. Nice.");
  });
});

describe("what's coming up", () => {
  it("gives homework and worksheets a few days' notice, and exams/projects/events a month", () => {
    const items = [
      item({ id: "hw-soon", kind: "homework", dueAt: new Date("2026-09-19T08:00:00.000Z") }),
      item({ id: "hw-far", kind: "worksheet", dueAt: new Date("2026-09-30T08:00:00.000Z") }),
      item({ id: "exam-far", kind: "exam", dueAt: new Date("2026-10-10T08:00:00.000Z") }),
      item({ id: "exam-too-far", kind: "exam", dueAt: new Date("2026-11-01T08:00:00.000Z") }),
      item({ id: "project-soon", kind: "project", dueAt: new Date("2026-09-20T08:00:00.000Z") }),
      item({ id: "event-soon", kind: "event", dueAt: new Date("2026-09-25T08:00:00.000Z") }),
      item({ id: "notice-no-window", kind: "notice", dueAt: new Date("2026-09-18T08:00:00.000Z") }),
    ];

    expect(upcomingSchoolItems(items, NOW).map((entry) => entry.id)).toEqual([
      "hw-soon",
      "project-soon",
      "event-soon",
      "exam-far",
    ]);
  });

  it("leaves out anything already past due, finished, or without a due date", () => {
    const items = [
      item({ id: "overdue", kind: "homework", dueAt: new Date("2026-09-16T08:00:00.000Z") }),
      item({ id: "done", kind: "homework", dueAt: new Date("2026-09-18T08:00:00.000Z"), status: "done" }),
      item({ id: "cancelled", kind: "exam", dueAt: new Date("2026-09-25T08:00:00.000Z"), status: "cancelled" }),
      item({ id: "no-date", kind: "exam", dueAt: null }),
    ];

    expect(upcomingSchoolItems(items, NOW)).toEqual([]);
  });

  it("sorts soonest first", () => {
    const items = [
      item({ id: "later", kind: "homework", dueAt: new Date("2026-09-20T08:00:00.000Z") }),
      item({ id: "sooner", kind: "homework", dueAt: new Date("2026-09-18T08:00:00.000Z") }),
    ];

    expect(upcomingSchoolItems(items, NOW).map((entry) => entry.id)).toEqual(["sooner", "later"]);
  });
});
