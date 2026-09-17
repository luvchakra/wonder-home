import { describe, expect, it } from "vitest";

import {
  ESCALATE_AFTER_MINUTES,
  chooseRecipient,
  chooseTime,
  decideEscalation,
  decideNotification,
  inQuietHours,
  shouldAutoResolve,
  type Candidate,
  type DecisionContext,
  type HouseholdEvent,
} from "./decide";

const NOW = new Date("2026-09-17T14:00:00Z");

const event = (over: Partial<HouseholdEvent> = {}): HouseholdEvent => ({
  threadKey: "outcome:laundry.ready",
  outcomeKey: "laundry.ready",
  kind: "exception",
  aiResolvable: false,
  riskLevel: "medium",
  dueAt: new Date("2026-09-17T20:00:00Z"),
  impact: "Laundry will not be ready for the week",
  recommendedAction: { action: "replan", target: "laundry.ready" },
  ...over,
});

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  memberId: "m-1",
  role: "primary",
  canAct: true,
  availability: null,
  ...over,
});

const ctx = (over: Partial<DecisionContext> = {}): DecisionContext => ({
  candidates: [candidate()],
  openThreadKeys: [],
  now: NOW,
  ...over,
});

describe("an event is not a reason to interrupt anyone", () => {
  it("stays silent while WonderHome can still fix it", () => {
    const decision = decideNotification(event({ aiResolvable: true }), ctx());
    expect(decision.kind).toBe("stay_silent");
  });

  it("does not announce routine work completing", () => {
    const decision = decideNotification(event({ kind: "completed" }), ctx());
    expect(decision.kind).toBe("stay_silent");
    expect(decision.kind === "stay_silent" && decision.because).toMatch(/not worth an interruption/i);
  });

  it("does not report a state change that puts nothing at risk", () => {
    const decision = decideNotification(event({ kind: "state_change", riskLevel: "low" }), ctx());
    expect(decision.kind).toBe("stay_silent");
  });

  it("does speak when a state change is genuinely risky", () => {
    expect(decideNotification(event({ kind: "state_change", riskLevel: "high" }), ctx()).kind).toBe("notify");
  });

  it("says nothing when there is no action to offer", () => {
    const decision = decideNotification(event({ recommendedAction: null }), ctx());
    expect(decision.kind).toBe("stay_silent");
    expect(decision.kind === "stay_silent" && decision.because).toMatch(/no action/i);
  });

  it("still asks when a decision is needed, even with no recommendation", () => {
    const decision = decideNotification(
      event({ kind: "approval_needed", recommendedAction: null }),
      ctx(),
    );
    expect(decision.kind).toBe("notify");
    expect(decision.kind === "notify" && decision.type).toBe("decision");
  });

  it("says nothing when nobody could act", () => {
    const decision = decideNotification(event(), ctx({ candidates: [candidate({ canAct: false })] }));
    expect(decision.kind).toBe("stay_silent");
    expect(decision.kind === "stay_silent" && decision.because).toMatch(/nobody/i);
  });
});

describe("who gets told", () => {
  it("prefers the responsible member", () => {
    const chosen = chooseRecipient([
      candidate({ memberId: "admin", role: "administrator" }),
      candidate({ memberId: "backup", role: "backup" }),
      candidate({ memberId: "owner", role: "primary" }),
    ]);
    expect(chosen?.memberId).toBe("owner");
  });

  it("falls to the backup when the owner cannot act", () => {
    const chosen = chooseRecipient([
      candidate({ memberId: "owner", role: "primary", canAct: false }),
      candidate({ memberId: "backup", role: "backup" }),
    ]);
    expect(chosen?.memberId).toBe("backup");
  });

  it("tells one person, not the household", () => {
    const decision = decideNotification(
      event(),
      ctx({ candidates: [candidate({ memberId: "a" }), candidate({ memberId: "b", role: "backup" })] }),
    );
    // Telling everybody is how a household learns to ignore notifications.
    expect(decision.kind === "notify" && decision.recipientMemberId).toBe("a");
  });
});

describe("when it arrives", () => {
  const quiet = candidate({ availability: { quietFrom: 22, quietUntil: 7 } });

  it("recognises quiet hours that wrap past midnight", () => {
    expect(inQuietHours(new Date("2026-09-17T23:00:00Z"), 22, 7)).toBe(true);
    expect(inQuietHours(new Date("2026-09-17T03:00:00Z"), 22, 7)).toBe(true);
    expect(inQuietHours(new Date("2026-09-17T14:00:00Z"), 22, 7)).toBe(false);
  });

  it("waits until morning rather than waking the household", () => {
    const night = new Date("2026-09-17T23:30:00Z");
    const deliverAt = chooseTime(
      event({ riskLevel: "medium", dueAt: new Date("2026-09-18T18:00:00Z") }),
      quiet,
      night,
    );
    expect(deliverAt.getUTCHours()).toBe(7);
    expect(deliverAt.getTime()).toBeGreaterThan(night.getTime());
  });

  it("wakes the household when waiting would be too late", () => {
    const night = new Date("2026-09-17T23:30:00Z");
    const deliverAt = chooseTime(
      event({ riskLevel: "medium", dueAt: new Date("2026-09-18T05:00:00Z") }),
      quiet,
      night,
    );
    expect(deliverAt).toEqual(night);
  });

  it("never holds a high risk for quiet hours", () => {
    const night = new Date("2026-09-17T23:30:00Z");
    expect(chooseTime(event({ riskLevel: "high" }), quiet, night)).toEqual(night);
  });

  it("delivers immediately when the deadline is close", () => {
    const soon = new Date("2026-09-17T23:00:00Z");
    expect(
      chooseTime(event({ riskLevel: "low", dueAt: new Date("2026-09-18T00:30:00Z") }), quiet, soon),
    ).toEqual(soon);
  });
});

describe("threads", () => {
  it("evolves an existing thread instead of starting another", () => {
    const decision = decideNotification(event(), ctx({ openThreadKeys: ["outcome:laundry.ready"] }));
    expect(decision.kind === "notify" && decision.updatesExistingThread).toBe(true);
  });

  it("starts a thread when the situation is new", () => {
    const decision = decideNotification(event(), ctx({ openThreadKeys: ["outcome:dinner.served"] }));
    expect(decision.kind === "notify" && decision.updatesExistingThread).toBe(false);
  });
});

describe("the decision can be explained afterwards", () => {
  it("records the factors it weighed", () => {
    const decision = decideNotification(event(), ctx());
    if (decision.kind !== "notify") throw new Error("expected a notification");

    expect(decision.factors).toMatchObject({
      recipientRole: "primary",
      riskLevel: "medium",
      aiResolvable: false,
    });
  });
});

describe("escalation", () => {
  const base = {
    state: "delivered" as const,
    deliveredAt: new Date("2026-09-17T13:00:00Z"),
    riskLevel: "medium" as const,
    dueAt: new Date("2026-09-17T20:00:00Z"),
    alreadyNotified: ["m-1"],
    candidates: [candidate(), candidate({ memberId: "m-2", role: "backup" })],
  };

  it("does not escalate something already dealt with", () => {
    expect(decideEscalation({ ...base, state: "acted" }, NOW).kind).toBe("hold");
    expect(decideEscalation({ ...base, state: "resolved" }, NOW).kind).toBe("hold");
  });

  it("waits while the first person still has time", () => {
    const justDelivered = new Date(NOW.getTime() - 5 * 60_000);
    expect(decideEscalation({ ...base, deliveredAt: justDelivered }, NOW).kind).toBe("hold");
  });

  it("involves the backup once it is overdue and still at risk", () => {
    const stale = new Date(NOW.getTime() - (ESCALATE_AFTER_MINUTES.medium + 10) * 60_000);
    const decision = decideEscalation({ ...base, deliveredAt: stale }, NOW);

    expect(decision.kind).toBe("escalate");
    expect(decision.kind === "escalate" && decision.toMemberId).toBe("m-2");
  });

  it("escalates a high risk sooner than a low one", () => {
    expect(ESCALATE_AFTER_MINUTES.high).toBeLessThan(ESCALATE_AFTER_MINUTES.low);
  });

  it("does not repeat itself to someone already told", () => {
    const stale = new Date(NOW.getTime() - 500 * 60_000);
    const decision = decideEscalation(
      { ...base, deliveredAt: stale, alreadyNotified: ["m-1", "m-2"] },
      NOW,
    );
    expect(decision.kind).toBe("hold");
  });

  it("stops escalating once the deadline has passed", () => {
    const stale = new Date(NOW.getTime() - 500 * 60_000);
    const decision = decideEscalation(
      { ...base, deliveredAt: stale, dueAt: new Date("2026-09-17T13:30:00Z") },
      NOW,
    );
    // It is a missed outcome now, which is a different conversation.
    expect(decision.kind).toBe("hold");
  });
});

describe("resolving itself", () => {
  it("clears once the outcome is met", () => {
    expect(shouldAutoResolve({ state: "delivered", outcomeStatus: "met" })).toBe(true);
  });

  it("clears when the outcome is cancelled", () => {
    expect(shouldAutoResolve({ state: "seen", outcomeStatus: "cancelled" })).toBe(true);
  });

  it("stays while the outcome is still at risk", () => {
    expect(shouldAutoResolve({ state: "delivered", outcomeStatus: "at_risk" })).toBe(false);
  });

  it("does not re-resolve something already closed", () => {
    expect(shouldAutoResolve({ state: "resolved", outcomeStatus: "met" })).toBe(false);
  });
});
