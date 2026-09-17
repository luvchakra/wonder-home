import { describe, expect, it } from "vitest";

import {
  assessCommunication,
  classify,
  mayOpenDocument,
  type SchoolCommunication,
} from "./communications";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const message = (over: Partial<SchoolCommunication> = {}): SchoolCommunication => ({
  id: "msg-1",
  childMemberId: "aarav",
  receivedAt: NOW,
  subject: "Science trip",
  summary: "The school needs permission for the science trip.",
  requiresAction: true,
  actionLabel: "Give permission",
  actionDueAt: new Date("2026-09-19T09:00:00.000Z"),
  ...over,
});

describe("deciding whether a school message asks anything", () => {
  it("recognises a request for permission", () => {
    const result = classify({ subject: "Science trip", body: "Please sign the consent form." });

    expect(result).toMatchObject({ requiresAction: true, actionLabel: "Give permission" });
  });

  it("recognises money", () => {
    expect(classify({ body: "The trip fee is due next week." }).actionLabel).toBe("Pay the school");
  });

  it("treats an explicit date as an ask even without a marker word", () => {
    const result = classify({ body: "Sports day is on the 20th.", dueAt: new Date("2026-09-20") });

    expect(result.requiresAction).toBe(true);
  });

  it("files a newsletter rather than promoting it", () => {
    // A newsletter turned into an action teaches a family to ignore the real ones.
    const result = classify({
      subject: "Weekly newsletter",
      body: "This week the children studied the water cycle and enjoyed the library visit.",
    });

    expect(result).toMatchObject({ requiresAction: false, actionLabel: null });
  });
});

describe("when the household hears about it", () => {
  it("says nothing about a message that asks nothing", () => {
    expect(assessCommunication(message({ requiresAction: false, actionDueAt: null }), NOW).notable).toBe(
      false,
    );
  });

  it("holds a far-off ask until it is nearly due", () => {
    const later = message({ actionDueAt: new Date("2026-10-30T09:00:00.000Z") });

    expect(assessCommunication(later, NOW).notable).toBe(false);
  });

  it("raises it as the date approaches", () => {
    const assessment = assessCommunication(message(), NOW);

    expect(assessment.status).toBe("at_risk");
    expect(assessment.action).toEqual({ action: "school_respond", target: "msg-1" });
  });

  it("treats today as urgent", () => {
    const today = message({ actionDueAt: new Date("2026-09-17T18:00:00.000Z") });

    expect(assessCommunication(today, NOW).riskLevel).toBe("high");
  });

  it("does not go quiet once the date has passed", () => {
    const late = message({ actionDueAt: new Date("2026-09-15T09:00:00.000Z") });
    const assessment = assessCommunication(late, NOW);

    expect(assessment.status).toBe("missed");
    expect(assessment.notable).toBe(true);
  });

  it("still surfaces an ask with no date, quietly", () => {
    const undated = message({ actionDueAt: null });
    const assessment = assessCommunication(undated, NOW);

    expect(assessment.notable).toBe(true);
    expect(assessment.riskLevel).toBe("low");
  });
});

describe("who may open a school document", () => {
  const document = { childMemberId: "aarav" };

  it("the child themselves", () => {
    expect(
      mayOpenDocument({ document, callerMemberId: "aarav", guardianOf: [], isAdministrator: false }),
    ).toEqual({ allowed: true });
  });

  it("a guardian of that child", () => {
    expect(
      mayOpenDocument({ document, callerMemberId: "priya", guardianOf: ["aarav"], isAdministrator: false }),
    ).toEqual({ allowed: true });
  });

  it("not another adult in the house who is not their guardian", () => {
    const decision = mayOpenDocument({
      document,
      callerMemberId: "sunita",
      guardianOf: [],
      isAdministrator: false,
    });

    expect(decision.allowed).toBe(false);
  });

  it("not another child", () => {
    expect(
      mayOpenDocument({ document, callerMemberId: "anaya", guardianOf: [], isAdministrator: false }).allowed,
    ).toBe(false);
  });

  it("refuses without confirming the document exists", () => {
    const decision = mayOpenDocument({
      document,
      callerMemberId: "sunita",
      guardianOf: [],
      isAdministrator: false,
    });

    if (decision.allowed) throw new Error("expected a refusal");
    expect(decision.reason).toBe("This is not yours to open.");
  });
});
