/**
 * Why a HomeSend item was archived (`home_send_items.archive_reason`): the
 * 30-day sweep's own reason, and the daily tidy's (`tidy.ts`). Kept on its own,
 * with nothing imported, so the screens can name a reason without loading the
 * tidy's rules.
 */
export const TIDY_REASONS = ["past_date", "already_recorded", "superseded", "unreadable", "cancelled"] as const;
export type TidyReason = (typeof TIDY_REASONS)[number];
/** Set aside so every item ends as something (2026-11-14, "Nothing waits"): not household information, kept as a household note, or unreadable and not sent again. */
export const NOTHING_WAITS_REASONS = ["not_household", "kept_as_note", "not_resent"] as const;
export const ARCHIVE_REASONS = ["untouched_30_days", ...TIDY_REASONS, "removed_by_person", ...NOTHING_WAITS_REASONS] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];
