import { describe, expect, it } from "vitest";

import { findTimingPattern, proposeTimingPattern } from "./pattern-learning";
import type { Outcome } from "./outcomes";

const at = (iso: string) => new Date(`2026-09-${iso}.000Z`);
const MIN_CONSISTENCY_FOR_TEST = 0.6;

const met = (over: Partial<Outcome> = {}): Outcome => ({
  id: `o-${Math.random()}`,
  outcomeKey: "meal.dinner",
  status: "met",
  riskLevel: "none",
  ownerMemberId: "m-1",
  windowStart: at("15T18:00:00"),
  dueAt: at("15T20:00:00"),
  verifiedAt: at("15T19:30:00"),
  verificationSource: "observed",
  ...over,
});

describe("finding a timing pattern", () => {
  it("finds nothing with too little history", () => {
    const outcomes = [met(), met(), met()];
    expect(findTimingPattern(outcomes, "meal.dinner")).toBeNull();
  });

  it("finds a pattern when completions cluster around the same time", () => {
    const outcomes = [
      met({ windowStart: at("15T18:00:00"), verifiedAt: at("15T19:28:00") }),
      met({ windowStart: at("16T18:00:00"), verifiedAt: at("16T19:32:00") }),
      met({ windowStart: at("17T18:00:00"), verifiedAt: at("17T19:31:00") }),
      met({ windowStart: at("18T18:00:00"), verifiedAt: at("18T19:29:00") }),
      met({ windowStart: at("19T18:00:00"), verifiedAt: at("19T19:30:00") }),
    ];
    const pattern = findTimingPattern(outcomes, "meal.dinner");
    expect(pattern).not.toBeNull();
    expect(pattern!.outcomeKey).toBe("meal.dinner");
    expect(pattern!.sampleSize).toBe(5);
    // Windows start at 18:00, so ~90 minutes in is 19:30.
    expect(pattern!.typicalMinutesIntoWindow).toBeGreaterThan(85);
    expect(pattern!.typicalMinutesIntoWindow).toBeLessThan(95);
    expect(pattern!.consistency).toBeGreaterThan(MIN_CONSISTENCY_FOR_TEST);
  });

  it("finds nothing when completions are scattered across the window", () => {
    const outcomes = [
      met({ windowStart: at("15T18:00:00"), verifiedAt: at("15T18:05:00") }),
      met({ windowStart: at("16T18:00:00"), verifiedAt: at("16T19:45:00") }),
      met({ windowStart: at("17T18:00:00"), verifiedAt: at("17T18:50:00") }),
      met({ windowStart: at("18T18:00:00"), verifiedAt: at("18T19:55:00") }),
      met({ windowStart: at("19T18:00:00"), verifiedAt: at("19T18:15:00") }),
    ];
    expect(findTimingPattern(outcomes, "meal.dinner")).toBeNull();
  });

  it("ignores outcomes that were not actually met", () => {
    const outcomes = [
      met(),
      met({ status: "missed", verifiedAt: null }),
      met({ status: "cancelled" }),
      met(),
      met(),
      met(),
    ];
    // Only 4 of the 6 are "met" with a verification — right at the minimum.
    expect(findTimingPattern(outcomes, "meal.dinner")?.sampleSize).toBe(4);
  });

  it("ignores a different outcome's history entirely", () => {
    const outcomes = [met(), met(), met(), met()].map((o) => ({ ...o, outcomeKey: "laundry.ready" }));
    expect(findTimingPattern(outcomes, "meal.dinner")).toBeNull();
  });

  it("ignores an outcome with no windowStart to measure from", () => {
    const outcomes = [
      met({ windowStart: null }),
      met({ windowStart: null }),
      met({ windowStart: null }),
      met({ windowStart: null }),
    ];
    expect(findTimingPattern(outcomes, "meal.dinner")).toBeNull();
  });
});

describe("proposing a timing pattern", () => {
  const pattern = { outcomeKey: "meal.dinner", typicalMinutesIntoWindow: 90, sampleSize: 12, consistency: 0.95 };

  it("proposes a real learning proposal for a strong pattern", () => {
    const proposal = proposeTimingPattern(pattern, false);
    expect(proposal).not.toBeNull();
    expect(proposal!.sourceType).toBe("observed");
    expect(proposal!.status).toBe("learned");
    expect(proposal!.key).toBe("timing.meal.dinner");
  });

  it("never proposes anything once the household has confirmed a fact about it", () => {
    // The story's own goal: learn normal timing without overriding confirmed rules.
    expect(proposeTimingPattern(pattern, true)).toBeNull();
  });

  it("gives fewer samples less confidence than the same consistency with more", () => {
    const fewSamples = proposeTimingPattern({ ...pattern, sampleSize: 4 }, false);
    const manySamples = proposeTimingPattern({ ...pattern, sampleSize: 12 }, false);
    expect(fewSamples!.confidence).toBeLessThan(manySamples!.confidence);
  });

  it("gives looser consistency less confidence than tighter consistency with the same samples", () => {
    const loose = proposeTimingPattern({ ...pattern, consistency: 0.6 }, false);
    const tight = proposeTimingPattern({ ...pattern, consistency: 0.95 }, false);
    expect(loose!.confidence).toBeLessThan(tight!.confidence);
  });

  it("never exceeds the confidence cap module 14 already enforces", () => {
    const proposal = proposeTimingPattern({ ...pattern, consistency: 1, sampleSize: 100 }, false);
    expect(proposal!.confidence).toBeLessThanOrEqual(0.8);
  });
});
