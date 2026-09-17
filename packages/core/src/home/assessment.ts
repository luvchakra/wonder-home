import type { OutcomeStatus, RiskLevel } from "../household/outcomes";

/**
 * The shape every home-domain assessment returns (module 13).
 *
 * Maintenance, laundry and pet care are different subjects with the same
 * discipline: work out what is true, say whether anyone needs to know, and if
 * they do, say what they can do about it. A shared shape is what lets the
 * notification engine treat them identically — it never needs to know whether
 * an item was an air conditioner, a school uniform or a cat.
 */
export type HomeAssessment = {
  /** Stable identity for the thing assessed, used as the notification thread. */
  subjectKey: string;
  /**
   * What the thing is called, in two or three words.
   *
   * Kept apart from `reason` because a row has to be scannable: the name
   * carries the recognition and the reason carries the explanation, and
   * collapsing them into one line makes both harder to read on a phone.
   */
  title: string;
  status: OutcomeStatus;
  riskLevel: RiskLevel;
  /**
   * Whether this is worth a person's attention. Almost everything is not:
   * an asset serviced on time, a uniform that will be ready, a cat with food
   * in the cupboard. Silence is the normal output of this module.
   */
  notable: boolean;
  reason: string;
  /** What the household could do. Never null when `notable` is true. */
  action: { action: string; target?: string } | null;
  /** ISO date this is due, when the subject has a date at all. */
  dueOn: string | null;
};

export function silent(subjectKey: string, title: string, reason: string): HomeAssessment {
  return {
    subjectKey,
    title,
    status: "on_track",
    riskLevel: "none",
    notable: false,
    reason,
    action: null,
    dueOn: null,
  };
}

/** ISO date (UTC) for a timestamp, which is how every date in this module is written. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Parses an ISO date as UTC midnight, or null if it is absent or malformed. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
