/**
 * Why a HomeSend item was archived (`home_send_items.archive_reason`): the
 * 30-day sweep's own reason, and the daily tidy's (`tidy.ts`). Kept on its own,
 * with nothing imported, so the screens can name a reason without loading the
 * tidy's rules.
 */
export const TIDY_REASONS = ["past_date", "already_recorded", "superseded", "unreadable", "cancelled"] as const;
export type TidyReason = (typeof TIDY_REASONS)[number];
export const ARCHIVE_REASONS = ["untouched_30_days", ...TIDY_REASONS, "removed_by_person"] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];
