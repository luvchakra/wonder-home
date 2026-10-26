/**
 * How sure HomeSend must be before it adds an entry on its own (the owner,
 * 2026-10-26: "make that 95% configurable by the admin").
 *
 * An Admin picks the bar on Settings → AI Assistant; a reading is added on
 * its own only when its score is strictly above it, and only where the
 * outcome's autonomy is "Pre Approved" (`confirmation.ts`). Everything else
 * that always waits — bills, health documents, receipts, photos and files,
 * paying, deleting — still waits whatever the bar says.
 *
 * Pure, so client screens can show a score; the stored choice is read and
 * saved in `auto-add-repository.ts`.
 */

/** The bars an Admin may pick (rule 20: picked, not typed), in percent. */
export const AUTO_ADD_PERCENTS = [60, 70, 80, 85, 90, 95, 97, 99] as const;
export type AutoAddPercent = (typeof AUTO_ADD_PERCENTS)[number];

/** The bar until an Admin picks another: more than 95%. */
export const DEFAULT_AUTO_ADD_PERCENT: AutoAddPercent = 95;

/** A stored or submitted value as a bar WonderHome offers; anything else is the default. */
export function asAutoAddPercent(value: unknown): AutoAddPercent {
  const number = typeof value === "string" ? Number(value) : value;
  return AUTO_ADD_PERCENTS.find((percent) => percent === number) ?? DEFAULT_AUTO_ADD_PERCENT;
}

/** A reading's score as a whole percent, for showing beside the entry; null when there is none. */
export function scorePercent(score: number | null | undefined): number | null {
  return typeof score === "number" && Number.isFinite(score) ? Math.round(score * 100) : null;
}
