import { describe, expect, it } from "vitest";

import {
  REVIEW_INTERVAL_DAYS,
  alertsFor,
  applyReview,
  assessRisk,
  certificationHealth,
  needsReview,
  summarize,
  type CertificationItem,
} from "./certification";

const NOW = new Date("2026-09-17T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const item = (over: Partial<CertificationItem> = {}): CertificationItem => ({
  id: "c-1",
  category: "home_routines",
  claim: "Laundry happens on Sundays",
  sourceType: "conversation",
  status: "confirmed",
  riskLevel: "low",
  lastReviewedAt: daysAgo(10),
  ...over,
});

describe("risk is about the subject, not the confidence", () => {
  it("treats money and access as critical", () => {
    expect(assessRisk({ category: "lifestyle", sourceType: "setup", affectsMoney: true })).toBe("critical");
    expect(assessRisk({ category: "lifestyle", sourceType: "setup", affectsAccess: true })).toBe("critical");
  });

  it("treats anything about a child, or safety, as high", () => {
    expect(assessRisk({ category: "lifestyle", sourceType: "setup", affectsChild: true })).toBe("high");
    expect(assessRisk({ category: "safety", sourceType: "setup" })).toBe("high");
  });

  it("rates a noticed pattern above something the household said", () => {
    expect(assessRisk({ category: "lifestyle", sourceType: "observed" })).toBe("medium");
    expect(assessRisk({ category: "lifestyle", sourceType: "conversation" })).toBe("low");
  });
});

describe("what needs reviewing", () => {
  it("flags anything contradicted", () => {
    expect(needsReview(item({ status: "needs_review" }), NOW)).toBe(true);
  });

  it("flags a belief that has never been checked", () => {
    expect(needsReview(item({ status: "learned", lastReviewedAt: null }), NOW)).toBe(true);
  });

  it("leaves a freshly confirmed belief alone", () => {
    expect(needsReview(item(), NOW)).toBe(false);
  });

  it("re-checks high-risk beliefs sooner than low-risk ones", () => {
    const age = REVIEW_INTERVAL_DAYS.high + 1;
    expect(needsReview(item({ riskLevel: "high", lastReviewedAt: daysAgo(age) }), NOW)).toBe(true);
    expect(needsReview(item({ riskLevel: "low", lastReviewedAt: daysAgo(age) }), NOW)).toBe(false);
  });

  it("does not keep asking about something already corrected or removed", () => {
    expect(needsReview(item({ status: "corrected", lastReviewedAt: null }), NOW)).toBe(false);
    expect(needsReview(item({ status: "removed", lastReviewedAt: null }), NOW)).toBe(false);
  });
});

describe("the understanding figure", () => {
  it("is a count of confirmed items, not an estimate", () => {
    const items = [
      item({ id: "a" }),
      item({ id: "b" }),
      item({ id: "c", status: "learned", lastReviewedAt: null }),
      item({ id: "d", status: "needs_review" }),
    ];

    const summary = summarize(items, NOW);
    expect(summary.confirmed).toBe(2);
    expect(summary.needsReview).toBe(2);
    expect(summary.understanding).toBe(50);
  });

  it("reports zero for a household nothing is known about, not a hundred", () => {
    // An empty household is not perfectly understood; it is not understood.
    expect(summarize([], NOW).understanding).toBe(0);
  });

  it("ignores corrected and removed items entirely", () => {
    const items = [item({ id: "a" }), item({ id: "b", status: "removed" })];
    expect(summarize(items, NOW).understanding).toBe(100);
  });

  it("breaks the figure down by category, so it can be acted on", () => {
    const items = [
      item({ id: "a", category: "finance", riskLevel: "high" }),
      item({ id: "b", category: "finance", status: "learned", lastReviewedAt: null }),
      item({ id: "c", category: "education" }),
    ];

    const summary = summarize(items, NOW);
    expect(summary.byCategory.finance).toEqual({ confirmed: 1, total: 2 });
    expect(summary.byCategory.education).toEqual({ confirmed: 1, total: 1 });
    expect(summary.byCategory.safety).toEqual({ confirmed: 0, total: 0 });
  });

  it("does not count a stale confirmation as confirmed", () => {
    const stale = item({ riskLevel: "critical", lastReviewedAt: daysAgo(400) });
    expect(summarize([stale], NOW).confirmed).toBe(0);
    expect(summarize([stale], NOW).needsReview).toBe(1);
  });
});

describe("alerts", () => {
  it("puts the riskiest thing first", () => {
    const alerts = alertsFor(
      [
        item({ id: "low", riskLevel: "low", status: "learned", lastReviewedAt: null }),
        item({ id: "critical", riskLevel: "critical", status: "needs_review" }),
        item({ id: "high", riskLevel: "high", status: "learned", lastReviewedAt: null }),
      ],
      NOW,
    );

    expect(alerts.map((alert) => alert.itemId)).toEqual(["critical", "high", "low"]);
  });

  it("gives every alert an action a person can take", () => {
    const alerts = alertsFor([item({ status: "needs_review" })], NOW);
    expect(alerts[0]?.action).toBe("fix");
    expect(alerts[0]?.reason.length).toBeGreaterThan(5);
  });

  it("asks to confirm a noticed pattern rather than to fix it", () => {
    const alerts = alertsFor(
      [item({ sourceType: "observed", status: "learned", lastReviewedAt: null })],
      NOW,
    );
    expect(alerts[0]?.action).toBe("confirm");
    expect(alerts[0]?.reason).toMatch(/pattern WonderHome noticed/i);
  });

  it("says nothing when nothing needs attention", () => {
    expect(alertsFor([item(), item({ id: "b" })], NOW)).toEqual([]);
  });

  it("shows a handful rather than everything", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      item({ id: `i-${index}`, status: "learned", lastReviewedAt: null }),
    );
    expect(alertsFor(many, NOW)).toHaveLength(5);
  });
});

describe("reviewing an item", () => {
  it("records when a belief was confirmed", () => {
    const reviewed = applyReview(item({ status: "learned" }), "confirmed", NOW);
    expect(reviewed.status).toBe("confirmed");
    expect(reviewed.lastReviewedAt).toEqual(NOW);
  });

  it("retires a corrected belief rather than editing it", () => {
    // The replacement is a new item, so what was believed before stays knowable.
    expect(applyReview(item(), "corrected", NOW).status).toBe("corrected");
  });

  it("records that someone looked without claiming they agreed", () => {
    const deferred = applyReview(item({ status: "learned" }), "deferred", NOW);
    expect(deferred.status).toBe("learned");
    expect(deferred.lastReviewedAt).toEqual(NOW);
  });
});

describe("certification health", () => {
  it("matches summarize()'s own understanding percentage", () => {
    const items = [item({ riskLevel: "low" }), item({ riskLevel: "high", status: "learned" })];
    expect(certificationHealth(items, NOW).understanding).toBe(summarize(items, NOW).understanding);
  });

  it("flags a high-risk gap even when the overall percentage looks healthy", () => {
    // Nine confirmed low-risk items and one stale high-risk one reads as
    // "90% understood" — this is the number that must not hide it.
    const items = [
      ...Array.from({ length: 9 }, () => item({ riskLevel: "low" })),
      item({ riskLevel: "high", lastReviewedAt: daysAgo(500) }),
    ];
    const health = certificationHealth(items, NOW);

    expect(health.understanding).toBeGreaterThanOrEqual(80);
    expect(health.highRiskGapExists).toBe(true);
    expect(health.byRisk.high.needsReview).toBe(1);
  });

  it("finds no gap when every high and critical item is current", () => {
    const items = [item({ riskLevel: "high" }), item({ riskLevel: "critical" })];
    const health = certificationHealth(items, NOW);

    expect(health.highRiskGapExists).toBe(false);
    expect(health.explanation).toMatch(/every high-risk belief is reviewed/i);
  });

  it("counts a needs_review item under its own risk level, not confirmed", () => {
    const items = [item({ riskLevel: "critical", status: "needs_review" })];
    const health = certificationHealth(items, NOW);

    expect(health.byRisk.critical.total).toBe(1);
    expect(health.byRisk.critical.needsReview).toBe(1);
    expect(health.byRisk.critical.confirmed).toBe(0);
  });

  it("names how many are critical specifically, not just how many are high risk", () => {
    const items = [
      item({ riskLevel: "critical", lastReviewedAt: daysAgo(500) }),
      item({ riskLevel: "high", lastReviewedAt: daysAgo(500) }),
    ];
    const health = certificationHealth(items, NOW);

    expect(health.explanation).toMatch(/2 beliefs/i);
    expect(health.explanation).toMatch(/1 of them critical/i);
  });

  it("says a lower-risk gap is not a high-risk one", () => {
    const items = [item({ riskLevel: "low", lastReviewedAt: daysAgo(500) })];
    const health = certificationHealth(items, NOW);

    expect(health.highRiskGapExists).toBe(false);
    expect(health.explanation).toMatch(/none of them high risk/i);
  });
});
