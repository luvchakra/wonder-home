import { describe, expect, it } from "vitest";

import type { HomeAssessment } from "../home/assessment";
import type { SchoolCommunication } from "./communications";
import type { SchoolItem } from "./items";
import { scopeSchoolAgendaToChild } from "./repository";

const ASMI = "asmi-member-id";
const MANAN = "manan-member-id";

function item(id: string, childMemberId: string): SchoolItem {
  return {
    id,
    childMemberId,
    kind: "homework",
    title: id,
    subject: null,
    detail: null,
    dueAt: null,
    dueTimeKnown: false,
    endsAt: null,
    estimatedMinutes: null,
    estimateSource: null,
    status: "pending",
    completedAt: null,
    provider: null,
    externalId: null,
  };
}

function communication(id: string, childMemberId: string | null): SchoolCommunication {
  return {
    id,
    childMemberId,
    receivedAt: new Date("2026-10-20T00:00:00.000Z"),
    subject: null,
    summary: id,
    requiresAction: false,
    actionLabel: null,
    actionDueAt: null,
  };
}

function deadline(subjectKey: string): HomeAssessment {
  return {
    subjectKey,
    title: subjectKey,
    status: "missed",
    riskLevel: "high",
    notable: true,
    reason: "overdue",
    action: { action: "Check in" },
    dueOn: "2026-10-24",
  };
}

function message(subjectKey: string): HomeAssessment {
  return {
    subjectKey,
    title: subjectKey,
    status: "at_risk",
    riskLevel: "medium",
    notable: true,
    reason: "asks something",
    action: { action: "Reply" },
    dueOn: null,
  };
}

// A household with two children: Asmi has an overdue deadline ("Grade 5 PT1
// Parent Teacher Meeting"), Manan has his own. The agenda is assessed once for
// the whole household, so each child's view has to be sliced back out.
const agenda = {
  items: [item("a1", ASMI), item("m1", MANAN)],
  communications: [
    communication("c-asmi", ASMI),
    communication("c-house", null),
    communication("c-manan", MANAN),
  ],
  deadlines: [deadline("school.a1"), deadline("school.m1")],
  messages: [message("school_message.c-asmi"), message("school_message.c-house"), message("school_message.c-manan")],
};

describe("scopeSchoolAgendaToChild", () => {
  it("shows a child-scoped deadline on that child's view", () => {
    const asmi = scopeSchoolAgendaToChild(agenda, ASMI);
    expect(asmi.deadlines.map((d) => d.subjectKey)).toEqual(["school.a1"]);
    expect(asmi.items.map((i) => i.id)).toEqual(["a1"]);
  });

  it("does NOT show a sibling's deadline on the other child's view (the PT-meeting bug)", () => {
    const manan = scopeSchoolAgendaToChild(agenda, MANAN);
    // Asmi's overdue "school.a1" must never surface under Manan.
    expect(manan.deadlines.map((d) => d.subjectKey)).toEqual(["school.m1"]);
    expect(manan.deadlines.some((d) => d.subjectKey === "school.a1")).toBe(false);
    expect(manan.items.map((i) => i.id)).toEqual(["m1"]);
  });

  it("scopes a child-specific message to that child, never a sibling", () => {
    const manan = scopeSchoolAgendaToChild(agenda, MANAN);
    expect(manan.messages.map((m) => m.subjectKey).sort()).toEqual([
      "school_message.c-house",
      "school_message.c-manan",
    ]);
    const asmi = scopeSchoolAgendaToChild(agenda, ASMI);
    expect(asmi.messages.some((m) => m.subjectKey === "school_message.c-manan")).toBe(false);
  });

  it("keeps a household-wide message (no child) visible to every child", () => {
    const asmi = scopeSchoolAgendaToChild(agenda, ASMI);
    const manan = scopeSchoolAgendaToChild(agenda, MANAN);
    expect(asmi.messages.some((m) => m.subjectKey === "school_message.c-house")).toBe(true);
    expect(manan.messages.some((m) => m.subjectKey === "school_message.c-house")).toBe(true);
  });

  it("counts checked rows for the scoped child only", () => {
    // Manan: one item + (his message + the household message) = 3.
    expect(scopeSchoolAgendaToChild(agenda, MANAN).checked).toBe(3);
    // Asmi: one item + (her message + the household message) = 3.
    expect(scopeSchoolAgendaToChild(agenda, ASMI).checked).toBe(3);
  });

  it("returns the whole agenda when no child is selected", () => {
    const all = scopeSchoolAgendaToChild(agenda, null);
    expect(all.deadlines).toHaveLength(2);
    expect(all.messages).toHaveLength(3);
    expect(all.items).toHaveLength(2);
  });
});
