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
 * saved in `household/auto-add-repository.ts` (HomeSend itself touches only its own tables, X-003).
 */

import { FROM_A_FILE } from "./verify";

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

/** Why a reading scored what it did, from what it was checked against (`verify.ts`); null when nothing needs saying. */
export type SureWhy = "verified" | "file" | "missing" | "unsure";

export function sureWhy(understanding: { check?: { verified?: boolean; unverified?: readonly string[] } | null; confidence?: string | null } | null | undefined): SureWhy | null {
  const unverified = understanding?.check?.unverified ?? [];
  if (understanding?.check?.verified) return "verified";
  if (unverified.includes(FROM_A_FILE)) return "file";
  if (unverified.length > 0) return "missing";
  return understanding?.confidence !== "high" ? "unsure" : null;
}

/** What was added on its own, and how sure WonderHome was (design §7: every "added on its own" message says so). */
export type AddedOnItsOwn = { title: string; where: string; percent?: number | null; why?: SureWhy | null };

const SURE_WHY_WORDS: Record<SureWhy, string> = {
  verified: "every detail is in what you sent",
  file: "read from a photo or file",
  missing: "some details aren't in what you sent",
  unsure: "the AI wasn't sure",
};

/** " (97% sure — every detail is in what you sent)" for a reply; empty when there is no score. */
export function sureClause(added: Pick<AddedOnItsOwn, "percent" | "why">): string {
  if (typeof added.percent !== "number") return "";
  return ` (${added.percent}% sure${added.why ? ` — ${SURE_WHY_WORDS[added.why]}` : ""})`;
}
