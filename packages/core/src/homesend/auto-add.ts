/**
 * How sure HomeSend must be before it adds an entry on its own (the owner,
 * 2026-10-26: "make that 95% configurable by the admin").
 *
 * An Admin picks the bar on Settings → AI Assistant; a reading is added on
 * its own only when its score is strictly above it, and only where the
 * outcome's autonomy is "Pre Approved" (`confirmation.ts`). Bills, receipts
 * and health documents wait too, unless an Admin turned on "Add money
 * entries directly" or "Add health entries directly" (`DirectAdd` below).
 * Photos and files, paying and deleting still wait whatever any setting says.
 *
 * Pure, so client screens can show a score; the stored choice is read and
 * saved in `household/auto-add-repository.ts` (HomeSend itself touches only its own tables, X-003).
 */

import { formatAmount, type Amount } from "../commerce/units";
import type { Translate } from "../i18n/translate";
import type { WaitingFor } from "./confirmation";
import { FROM_A_FILE, VERIFIED_CONFIDENCE } from "./verify";
import type { HomeSendKind } from "./items";

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

/**
 * The reason explains the score, never contradicts it (the owner, 2026-10-26:
 * "70% sure · every detail is in what you sent"): "verified" only in the 97%
 * band. Every detail found but the AI itself unsure (a medium reading, or a
 * voice note not clearly heard) is "unsure".
 */
export function sureWhy(
  understanding: { check?: { verified?: boolean; unverified?: readonly string[] } | null; confidence?: string | null; score?: number | null } | null | undefined,
): SureWhy | null {
  const unverified = understanding?.check?.unverified ?? [];
  const score = understanding?.score;
  const inTopBand = typeof score === "number" && Number.isFinite(score) ? score >= VERIFIED_CONFIDENCE : understanding?.confidence === "high";
  if (understanding?.check?.verified) return inTopBand ? "verified" : "unsure";
  if (unverified.includes(FROM_A_FILE)) return "file";
  if (unverified.length > 0) return "missing";
  return understanding?.confidence !== "high" ? "unsure" : null;
}

/** What was added on its own, and how sure WonderHome was (design §7: every "added on its own" message says so). */
export type AddedOnItsOwn = {
  title: string;
  where: string;
  /** What kind it was: a health document's own title is never repeated outside the app, nor a bill's numbers. */
  kind?: HomeSendKind | null;
  percent?: number | null;
  why?: SureWhy | null;
  /** A top-up of a grocery already on the shopping list (I-27): what it added, and what the list says now. */
  more?: { added: Amount; now: Amount };
};

/** Something that would have been added on its own, still waiting in HomeSend, and why (`confirmation.ts` `wait`). */
export type WaitingInHomeSend = { waiting: WaitingFor; title: string };

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

/** "2 L", "6 pcs": a grocery amount in a reply, the way the Groceries list shows it. */
export function amountWords(amount: Amount): string {
  return formatAmount(amount, "en");
}

/** Whether HomeSend's answer added something, rather than leaving it waiting with a reason. */
export function wasAdded(result: AddedOnItsOwn | WaitingInHomeSend | null | undefined): result is AddedOnItsOwn {
  return Boolean(result) && !("waiting" in result!);
}

/** Why it waits, in HomeTalk's words, never with an amount (I-27): null when nothing needs saying. */
export function waitingWords(waiting: WaitingFor | null | undefined, title: string): string | null {
  if (!waiting) return null;
  if (waiting.listed || waiting.reason === "on_list") return `**${title}** is already on your shopping list, so it's waiting in HomeSend for you to choose.`;
  if (waiting.reason === "wait_for_approval") return `Your household has ${waiting.area === "school" ? "school work" : "groceries"} set to Wait for Approval, so it's waiting in HomeSend for you to approve.`;
  return `WonderHome adds things on its own only when it is more than ${waiting.percent ?? DEFAULT_AUTO_ADD_PERCENT}% sure, so it's waiting in HomeSend for you to check.`;
}

/** The Needs review row's one line of reason (design principle 4): "already on the shopping list", "below your bar of 95%". */
export function waitRowWords(waiting: WaitingFor, t: Translate): string {
  if (waiting.reason === "on_list") return t("homesend.inbox.wait.onList");
  if (waiting.reason === "wait_for_approval") return t(waiting.area === "school" ? "homesend.inbox.wait.approvalSchool" : "homesend.inbox.wait.approvalGroceries");
  return t("homesend.inbox.wait.belowBar", { percent: waiting.percent ?? DEFAULT_AUTO_ADD_PERCENT });
}

/**
 * Whether bills and receipts ("money") and health documents ("health") may
 * be added on their own at all (the owner, 2026-10-26: "along with the %
 * setting add setting feature to ask user if they want to add entries related
 * to health, entries related to money directly in WonderHome if allowed in
 * responsibilities"). Each is an Admin's choice, off until one turns it on,
 * and off whenever it can't be read (`household/direct-add-repository.ts`).
 * On, the entry still needs its responsibility Pre Approved and a reading
 * above the bar, like any other (`confirmation.ts`).
 */
export type DirectAddArea = "money" | "health";
export type DirectAdd = Record<DirectAddArea, boolean>;

/** Both off: the default, and the answer whenever the settings can't be read. */
export const NO_DIRECT_ADD: DirectAdd = { money: false, health: false };

/** Which of the two settings decides a kind; null for a kind neither decides. */
export function directAddAreaOf(kind: HomeSendKind | null | undefined): DirectAddArea | null {
  if (kind === "bill" || kind === "receipt") return "money";
  if (kind === "health_document") return "health";
  return null;
}
