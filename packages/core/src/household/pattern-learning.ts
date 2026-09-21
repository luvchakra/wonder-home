import { proposeLearning, type LearningProposal } from "../ai/orchestrator";
import type { Outcome } from "./outcomes";

/**
 * Pattern learning (story 03-007).
 *
 * An outcome's *rule* — its window, its owner, whether it needs verification
 * at all — is something a household set, deliberately, and it stays exactly
 * what they set until they change it. What this module learns is something
 * else: when, within that rule, the outcome actually tends to resolve. A
 * dinner outcome whose window runs 18:00–21:00 but which has been verified
 * within ten minutes of 19:30 for the last several weeks has a normal time
 * worth noticing — not a new deadline, a pattern a person may want to see
 * and could choose to confirm into one.
 *
 * Every result here is a `LearningProposal` (module 14): sourceType
 * "observed", capped confidence, status "learned" — never a rule change,
 * because that is a household's decision and this module makes none. And a
 * pattern is never even proposed for something the household has already
 * confirmed: confirming a fact is a deliberate act, and a pattern noticed
 * afterward should not compete with it, even as a mere suggestion.
 */

export type TimingPattern = {
  outcomeKey: string;
  /** Minutes into the window the outcome typically resolves, rounded. */
  typicalMinutesIntoWindow: number;
  sampleSize: number;
  /** How tightly the samples cluster: 0 (scattered) to 1 (identical every time). */
  consistency: number;
};

/** Below this many completions, there is nothing to call a pattern yet. */
const MIN_SAMPLES = 4;
/** Below this consistency, the scatter is noise, not a pattern. */
const MIN_CONSISTENCY = 0.6;
/** Samples beyond this many stop raising confidence further. */
const CONFIDENCE_SAMPLE_CEILING = 12;

function minutesIntoWindow(outcome: Outcome): number {
  // Only called after filtering for outcomes with both dates set.
  return (outcome.verifiedAt!.getTime() - outcome.windowStart!.getTime()) / 60_000;
}

/**
 * Finds a normal timing pattern for one outcome key, if its history is
 * consistent enough to call one.
 *
 * Only outcomes actually met — verified, not merely due — count as a
 * completion: a missed or cancelled outcome says nothing about when this
 * household normally finishes it.
 */
export function findTimingPattern(outcomes: readonly Outcome[], outcomeKey: string): TimingPattern | null {
  const completions = outcomes.filter(
    (o): o is Outcome & { windowStart: Date; verifiedAt: Date } =>
      o.outcomeKey === outcomeKey && o.status === "met" && o.windowStart !== null && o.verifiedAt !== null,
  );
  if (completions.length < MIN_SAMPLES) return null;

  const offsets = completions.map(minutesIntoWindow);
  const mean = offsets.reduce((sum, v) => sum + v, 0) / offsets.length;
  const variance = offsets.reduce((sum, v) => sum + (v - mean) ** 2, 0) / offsets.length;
  const stdDev = Math.sqrt(variance);

  // A pattern with as much scatter as the mean itself is not a pattern.
  const consistency = mean === 0 ? (stdDev === 0 ? 1 : 0) : Math.max(0, 1 - stdDev / Math.abs(mean));
  if (consistency < MIN_CONSISTENCY) return null;

  return {
    outcomeKey,
    typicalMinutesIntoWindow: Math.round(mean),
    sampleSize: completions.length,
    consistency: Math.round(consistency * 100) / 100,
  };
}

/**
 * Turns a found pattern into the same learning-proposal shape module 14
 * uses everywhere else. More samples and tighter consistency both raise
 * confidence, but neither alone is enough — four identical readings and
 * forty scattered ones should not earn the same trust.
 *
 * Returns `null`, proposing nothing, when the household has already
 * confirmed a fact about this outcome's timing — the gate the story's goal
 * states directly, made a caller-supplied fact rather than an assumption so
 * it can be tested.
 */
export function proposeTimingPattern(
  pattern: TimingPattern,
  alreadyConfirmed: boolean,
): LearningProposal | null {
  if (alreadyConfirmed) return null;

  const sampleFactor = Math.min(1, pattern.sampleSize / CONFIDENCE_SAMPLE_CEILING);
  const confidence = pattern.consistency * sampleFactor;

  return proposeLearning({
    key: `timing.${pattern.outcomeKey}`,
    value: { typicalMinutesIntoWindow: pattern.typicalMinutesIntoWindow, sampleSize: pattern.sampleSize },
    confidence,
  });
}
