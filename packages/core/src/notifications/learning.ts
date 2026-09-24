import { localMoment } from "./timing";

/**
 * When a person usually deals with a kind of reminder (story 23-012).
 *
 * Only a scheduling signal, and only a strong one. With fewer than five
 * times on record, or times scattered across the day, there is nothing to
 * learn and the policy's own time stands. What counts as "dealing with it" is
 * a person acting on the reminder itself, never a guess from elsewhere.
 */

export const MIN_LEARNING_EVIDENCE = 5;
/** Half the middle of their times must fall within this many minutes. */
const MAX_SPREAD_MINUTES = 120;

export type LearnedTime = { minute: number; evidence: number };

export function learnedMinuteFrom(actedAt: readonly Date[], timeZone: string): LearnedTime | null {
  if (actedAt.length < MIN_LEARNING_EVIDENCE) return null;
  const minutes = actedAt.map((at) => localMoment(at, timeZone).minuteOfDay).sort((a, b) => a - b);
  const quantile = (q: number) => minutes[Math.min(minutes.length - 1, Math.round(q * (minutes.length - 1)))]!;
  // Scattered habits teach nothing: the middle half must sit close together.
  if (quantile(0.75) - quantile(0.25) > MAX_SPREAD_MINUTES) return null;
  const middle = (minutes.length - 1) / 2;
  const median = (minutes[Math.floor(middle)]! + minutes[Math.ceil(middle)]!) / 2;
  // To the quarter hour — a reminder at 7:13 pm claims a precision it does not have.
  const minute = (Math.round(median / 15) * 15) % (24 * 60);
  return { minute, evidence: actedAt.length };
}
