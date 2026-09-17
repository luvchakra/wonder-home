/**
 * Age bands (story 01-004).
 *
 * Age-based permissions are derived from the date of birth every time they are
 * asked for, never stored. That is what makes "age changes trigger
 * re-evaluation" true by construction: there is no cached band to go stale, and
 * a child's access widens on their birthday without anything having to run.
 */

export type AgeBand = "young_child" | "older_child" | "teen" | "adult";

export const AGE_BAND_THRESHOLDS = { older_child: 8, teen: 13, adult: 18 } as const;

/**
 * Completed years between two dates.
 *
 * Compared as calendar parts rather than by dividing elapsed milliseconds, so
 * daylight saving and leap years cannot move a birthday by a day.
 */
export function completedYears(dateOfBirth: Date, on: Date = new Date()): number {
  let years = on.getUTCFullYear() - dateOfBirth.getUTCFullYear();

  const monthDelta = on.getUTCMonth() - dateOfBirth.getUTCMonth();
  const dayDelta = on.getUTCDate() - dateOfBirth.getUTCDate();
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) years -= 1;

  return Math.max(0, years);
}

export function ageBandFor(dateOfBirth: Date | null, on: Date = new Date()): AgeBand | null {
  if (!dateOfBirth) return null;

  const years = completedYears(dateOfBirth, on);
  if (years >= AGE_BAND_THRESHOLDS.adult) return "adult";
  if (years >= AGE_BAND_THRESHOLDS.teen) return "teen";
  if (years >= AGE_BAND_THRESHOLDS.older_child) return "older_child";
  return "young_child";
}

/** Parses a `date` column value (YYYY-MM-DD) as a calendar date, not a moment. */
export function parseDateOfBirth(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // Rejects impossible dates that Date would otherwise roll over, e.g. 2026-02-31.
  return date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? date
    : null;
}

/**
 * True when a child has reached the age at which the household should revisit
 * their access. Surfaced as a review item rather than applied silently: turning
 * eighteen does not automatically make someone an adult member of a household,
 * and quietly widening a person's access is not a decision software should make
 * on its own.
 */
export function needsAgeReview(dateOfBirth: Date | null, on: Date = new Date()): boolean {
  return ageBandFor(dateOfBirth, on) === "adult";
}
