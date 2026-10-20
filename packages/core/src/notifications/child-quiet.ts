import { ageBandFor, parseDateOfBirth } from "../identity/age";
import type { QuietHours } from "./timing";

/**
 * Quiet hours for a child, by age (story 27-015).
 *
 * A child's reminders should not buzz at bedtime, and nobody should have to set
 * that up for them first. Until a guardian sets their own, a child's quiet
 * hours follow their age band, read from the date of birth each time (never
 * stored, so they widen on a birthday without anything running):
 *
 * - under 8: 7:30 PM to 7:00 AM
 * - 8 to 12: 8:30 PM to 7:00 AM
 * - 13 to 17: 10:00 PM to 7:00 AM
 *
 * Anyone older has no default: an adult sets their own. A child with no date
 * of birth on record gets the middle band, since guessing the youngest would
 * silence a teenager and guessing the oldest would wake a six-year-old.
 */
export const CHILD_QUIET_BY_BAND = {
  young_child: { fromMinute: 19 * 60 + 30, untilMinute: 7 * 60 },
  older_child: { fromMinute: 20 * 60 + 30, untilMinute: 7 * 60 },
  teen: { fromMinute: 22 * 60, untilMinute: 7 * 60 },
} as const satisfies Record<string, QuietHours>;

export function childQuietHours(input: { memberType: string; dateOfBirth: string | null | undefined }, on: Date = new Date()): QuietHours | null {
  if (input.memberType !== "child") return null;
  const band = ageBandFor(parseDateOfBirth(input.dateOfBirth), on) ?? "older_child";
  return band === "adult" ? null : { ...CHILD_QUIET_BY_BAND[band] };
}

/** The stored shape of a window: whole hours and minutes past the hour, as the preference columns keep them. */
export function quietColumns(quiet: QuietHours) {
  return {
    quietFrom: Math.floor(quiet.fromMinute / 60),
    quietFromMinute: quiet.fromMinute % 60,
    quietUntil: Math.floor(quiet.untilMinute / 60),
    quietUntilMinute: quiet.untilMinute % 60,
  };
}
