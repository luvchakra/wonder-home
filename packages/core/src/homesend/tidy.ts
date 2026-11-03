import { validateAnswer } from "../homebrain/validate";
import type { TidyReason } from "./archive-reasons";
import { readCheckingState, type CheckingState } from "./checking";
import type { HomeSendExtraction, HomeSendFailureReason, HomeSendKind, HomeSendStatus } from "./items";
import type { HomeSendReconciliation } from "./reconcile";
import type { IntakeUnderstanding } from "./understanding";
import { daysBetween, RETRY_CAP } from "./waiting";

/**
 * The daily tidy (the owner, 2026-11-03: "on daily basis check items pending
 * for review and remove the items which don't make sense anymore, based on due
 * date or other info, use ai to decide").
 *
 * What it looks at: items still waiting for a yes, failed items, and the
 * source items of entries added as Checking whose questions have ended
 * unanswered ("please check"). What it does with one that no longer applies:
 * archives it, with a reason, restorable for 30 days from HomeSend → Archived.
 * Nothing is deleted, nothing is added, nothing is paid.
 *
 * Rules first, from the item's own evidence:
 *
 *   past_date        — every day it names has passed on the household's
 *                      calendar, with one day's grace;
 *   already_recorded — the same thing is already on record (`reconcile.ts`
 *                      says "duplicate"; an update, cancellation or conflict
 *                      still needs a person, so it stays);
 *   superseded       — a newer item from the same sender about the same thing;
 *   unreadable       — failed, and still unread after the retry cap.
 *
 * Bills, receipts and health documents: only "its day has passed AND it is
 * already on record" applies — never the model, never a date alone.
 *
 * The model is asked only about what the rules cannot settle (a waiting item
 * with no day WonderHome could read), and only gives a verdict from a fixed
 * list, citing the item's own fields. The verdict is checked here before it
 * counts: the fields it cites must exist (`homebrain/validate.ts`
 * `unknown_fact`), a date it claims must be written in what it cites
 * (`unsupported_date`) and must really be past, a newer item it names must be
 * one it was shown. Anything unchecked, or unsure, keeps the item. No model
 * words ever reach a person: the summary is counts in `reminder.*` words.
 *
 * Pure: nothing here reads, writes or calls a model.
 */

/** One day of grace after an item's day before it counts as past. */
export const TIDY_GRACE_DAYS = 1;
/** A fresh item is never asked about: it has had no time to go stale. */
export const AI_MIN_WAIT_DAYS = 2;
/** At most this many items per household per day go to the model. */
export const AI_ITEMS_PER_RUN = 10;

/** Why the tidy archived an item: a closed list, stored on the row (`archive_reason`, `archive-reasons.ts`). */
export { ARCHIVE_REASONS, TIDY_REASONS, type ArchiveReason, type TidyReason } from "./archive-reasons";
/** What the model may say: a subset, each one checkable against the item. */
export const AI_TIDY_REASONS = ["past_date", "superseded", "cancelled"] as const;
export type AiTidyReason = (typeof AI_TIDY_REASONS)[number];

export type TidyBy = "rule" | "ai";

/** Fields the model is shown, by name; it may cite only these. `sent` is context, never evidence of a past day. */
export const TIDY_FIELDS = ["title", "summary", "dateText", "subject", "notes", "location", "sent"] as const;
export type TidyField = (typeof TIDY_FIELDS)[number];

export type TidyItem = {
  id: string;
  status: HomeSendStatus;
  kind: HomeSendKind | null;
  extracted: Partial<HomeSendExtraction> | null;
  understanding: Pick<IntakeUnderstanding, "change" | "document" | "contentSummary"> | null;
  /** Who sent it: the member, or the email address it came from. Null when neither is known. */
  sender: string | null;
  /** The member who sent it in, when one did: who hears about it. */
  memberId?: string | null;
  createdAt: string;
  updatedAt: string;
  failureReason: HomeSendFailureReason | null;
  retryCount: number;
  retryRequestedAt: string | null;
  /** The entry it added is still Checking (unconfirmed). Only read for a `routed` item. */
  unconfirmed?: boolean;
  /** `understanding.checking`, for a `routed` item. */
  checking?: unknown;
};

export type TidyEvidence = { field: string; value: string };

export type TidyDecision =
  | { action: "archive"; reason: TidyReason; by: TidyBy; evidence: TidyEvidence[] }
  | { action: "keep"; why: KeepWhy; askAi: boolean };

export type KeepWhy =
  | "not_in_scope"
  | "future_date"
  | "money_or_health"
  | "needs_person"
  | "retry_left"
  | "too_fresh"
  | "nothing_to_go_on"
  | "ai_kept"
  | "ai_unchecked"
  | "ai_unavailable";

export const MONEY_OR_HEALTH: ReadonlySet<HomeSendKind> = new Set(["bill", "receipt", "health_document"]);

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** "2026-10-05" from "2026-10-05" or "2026-10-05T09:00:00Z"; null for anything that is not a real day. */
export function isoDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = ISO_DAY.exec(value.trim());
  if (!match) return null;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? null : day;
}

/** Days from `day` to `today` (both YYYY-MM-DD): positive when `day` is behind us. */
export function daysSince(day: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
}

/** Past, with grace: the day before yesterday or earlier. */
export function isPastWithGrace(day: string, today: string): boolean {
  return daysSince(day, today) > TIDY_GRACE_DAYS;
}

/**
 * The days an item is about, as WonderHome read them: a due date or an
 * event's day, and every dated record of a document. A health document's or a
 * receipt's own date is when it was written, not a day it is about, so only a
 * bill's due date counts among money and health — and those use it only beside
 * "already on record".
 */
export function itemDays(item: Pick<TidyItem, "kind" | "extracted" | "understanding">): string[] {
  const days = new Set<string>();
  const kind = item.kind;
  const due = isoDay(item.extracted?.dueDate);
  if (due && kind !== "grocery_item") days.add(due);
  if (kind === "health_document" || kind === "receipt") {
    const written = isoDay(item.extracted?.documentDate);
    if (written) days.add(written);
  }
  for (const record of item.understanding?.document?.records ?? []) {
    const day = isoDay(record.date);
    if (day && record.domain !== "grocery_item") days.add(day);
  }
  return [...days].sort();
}

export function normaliseTitle(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The newer items from the same sender, of the same kind, that it could have been replaced by. */
export function newerFromSameSender(item: TidyItem, others: readonly TidyItem[]): TidyItem[] {
  if (!item.sender || !item.kind || item.kind === "unknown") return [];
  return others.filter(
    (other) =>
      other.id !== item.id &&
      other.sender === item.sender &&
      other.kind === item.kind &&
      other.createdAt > item.createdAt &&
      (other.status === "received" || other.status === "classified" || other.status === "routed"),
  );
}

/** A newer item, same sender, same kind, the same title word for word (punctuation and case aside). */
export function supersededBy(item: TidyItem, others: readonly TidyItem[]): TidyItem | null {
  const title = normaliseTitle(item.extracted?.title);
  if (!title) return null;
  return newerFromSameSender(item, others).find((other) => normaliseTitle(other.extracted?.title) === title) ?? null;
}

const WAITING: ReadonlySet<HomeSendStatus> = new Set(["received", "classified"]);

/** Whether a routed item is a Checking entry whose questions ended with no confirmation. */
export function checkingEnded(item: Pick<TidyItem, "status" | "checking" | "unconfirmed">): boolean {
  if (item.status !== "routed" || item.unconfirmed !== true) return false;
  const state: CheckingState | null = readCheckingState(item.checking);
  return state?.done === "please_check";
}

/**
 * What the rules say about one item. `reconciliation` is what `reconcile.ts`
 * found for it (undefined: not looked up). `others` are the household's other
 * recent items, for "superseded". `askAi` is set only where the rules could not
 * settle it and the model is allowed to be asked.
 */
export function decideByRules(
  item: TidyItem,
  context: { today: string; timeZone: string; now: Date; reconciliation?: HomeSendReconciliation | null; others: readonly TidyItem[] },
): TidyDecision {
  const { today } = context;
  const days = itemDays(item);
  const allPast = days.length > 0 && days.every((day) => isPastWithGrace(day, today));
  const pastEvidence = days.map((day) => ({ field: "date", value: day }));

  // Failed: only "still unreadable after every try".
  if (item.status === "failed") {
    if (item.retryCount >= RETRY_CAP && !item.retryRequestedAt) {
      return { action: "archive", reason: "unreadable", by: "rule", evidence: [{ field: "tries", value: String(item.retryCount) }] };
    }
    return { action: "keep", why: "retry_left", askAi: false };
  }

  // An entry added as Checking whose questions ended unanswered: its source item goes once its day has passed.
  // The entry itself is never touched; money and health stay for a person.
  if (item.status === "routed") {
    if (!checkingEnded(item)) return { action: "keep", why: "not_in_scope", askAi: false };
    if (item.kind && MONEY_OR_HEALTH.has(item.kind)) return { action: "keep", why: "money_or_health", askAi: false };
    return allPast ? { action: "archive", reason: "past_date", by: "rule", evidence: pastEvidence } : { action: "keep", why: days.length > 0 ? "future_date" : "nothing_to_go_on", askAi: false };
  }

  if (!WAITING.has(item.status)) return { action: "keep", why: "not_in_scope", askAi: false };

  const proposal = context.reconciliation?.proposal.type ?? null;
  const onRecord = proposal === "duplicate";

  // Bills, receipts and health documents: only "past AND already on record".
  if (item.kind && MONEY_OR_HEALTH.has(item.kind)) {
    if (allPast && onRecord) {
      return { action: "archive", reason: "already_recorded", by: "rule", evidence: [...pastEvidence, { field: "record", value: context.reconciliation!.existingId }] };
    }
    return { action: "keep", why: "money_or_health", askAi: false };
  }

  if (allPast) return { action: "archive", reason: "past_date", by: "rule", evidence: pastEvidence };
  if (onRecord) return { action: "archive", reason: "already_recorded", by: "rule", evidence: [{ field: "record", value: context.reconciliation!.existingId }] };
  const newer = supersededBy(item, context.others);
  if (newer) return { action: "archive", reason: "superseded", by: "rule", evidence: [{ field: "newer", value: newer.id }] };

  // A day still ahead, or a change to a record a person must decide: kept, no model.
  if (days.length > 0) return { action: "keep", why: "future_date", askAi: false };
  if (proposal) return { action: "keep", why: "needs_person", askAi: false };
  if (daysBetween(new Date(item.createdAt), context.now, context.timeZone) < AI_MIN_WAIT_DAYS) return { action: "keep", why: "too_fresh", askAi: false };
  const hasWords = Boolean(item.extracted?.title || item.extracted?.summary || item.extracted?.dateText || item.understanding?.contentSummary);
  return { action: "keep", why: "nothing_to_go_on", askAi: hasWords && item.kind !== null };
}

// --- The model's verdict, and the check it must pass ---------------------------------

export type TidyFact = { id: TidyField; text: string };

/** What the model is shown about an item, field by field. Names are the caller's to take out. */
export function tidyFacts(item: TidyItem, scrub: (text: string) => string = (text) => text): TidyFact[] {
  const extracted = item.extracted ?? {};
  const pick = (value: unknown) => (typeof value === "string" && value.trim() ? scrub(value.trim()).slice(0, 400) : null);
  const facts: TidyFact[] = [];
  const add = (id: TidyField, value: string | null) => {
    if (value) facts.push({ id, text: value });
  };
  add("title", pick(extracted.title));
  add("summary", pick(extracted.summary) ?? pick(item.understanding?.contentSummary));
  add("dateText", pick(extracted.dateText));
  add("subject", pick(extracted.subject));
  add("notes", pick(extracted.notes));
  add("location", pick(extracted.location));
  add("sent", item.createdAt.slice(0, 10));
  return facts;
}

/** The model's answer for one item, as its schema allows. */
export type TidyVerdict = {
  item: string;
  stale: boolean;
  reason: string | null;
  cited: string[];
  /** For `past_date`: the day it read, YYYY-MM-DD. */
  date?: string | null;
  /** For `superseded`: the label of the newer item it was shown. */
  newer?: string | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CANCEL_WORDS = /\b(?:cancel(?:l?ed|s|ling|lation)?|called off|call(?:ing)? off|won'?t (?:be )?(?:held|happen(?:ing)?)|not (?:be )?(?:held|happening)|postponed (?:indefinitely|until further notice))\b/i;
const YEAR = /\b(20\d{2})\b/g;

export type VerdictCheck =
  | { ok: true; reason: AiTidyReason; evidence: TidyEvidence[] }
  | { ok: false; why: "kept" | "unknown_reason" | "money_or_health" | "unknown_field" | "nothing_cited" | "unsupported_date" | "not_past" | "wrong_year" | "unknown_newer" | "not_cancelled" | "on_record" };

/**
 * Whether a model's verdict holds against the item's own fields. Only a
 * verdict that passes archives anything; the rest keep the item.
 *
 *   - every cited field was shown (`validateAnswer` `unknown_fact`);
 *   - past_date: the day is written in what it cites (`unsupported_date`,
 *     against the cited fields only, never "sent"), a year it cites matches,
 *     a day with no year is no more than 60 days before it was sent, and the
 *     day is past with grace on the household's calendar;
 *   - superseded: it names a newer item from the same sender, of the same
 *     kind, that it was shown;
 *   - cancelled: what it cites says so, and nothing on record is matched
 *     (a cancellation of a record waits for a person).
 */
export function checkVerdict(
  verdict: TidyVerdict,
  item: TidyItem,
  context: { today: string; facts: readonly TidyFact[]; newerLabels: ReadonlyMap<string, string>; reconciliation?: HomeSendReconciliation | null },
): VerdictCheck {
  if (!verdict.stale) return { ok: false, why: "kept" };
  if (!AI_TIDY_REASONS.includes(verdict.reason as AiTidyReason)) return { ok: false, why: "unknown_reason" };
  if (item.kind && MONEY_OR_HEALTH.has(item.kind)) return { ok: false, why: "money_or_health" };
  const reason = verdict.reason as AiTidyReason;
  const cited = [...new Set(verdict.cited.map((field) => field.trim()).filter(Boolean))];
  if (cited.length === 0 && reason !== "superseded") return { ok: false, why: "nothing_cited" };
  const shown = context.facts;
  const known = validateAnswer({ text: "", usedFacts: cited }, { facts: shown, question: "", localNow: "", today: context.today });
  if (known.violations.some((violation) => violation.kind === "unknown_fact")) return { ok: false, why: "unknown_field" };
  const citedFacts = shown.filter((fact) => cited.includes(fact.id) && fact.id !== "sent");

  if (reason === "past_date") {
    const day = isoDay(verdict.date);
    if (!day || citedFacts.length === 0) return { ok: false, why: "unsupported_date" };
    const [year, month, date] = day.split("-").map(Number) as [number, number, number];
    // The day must be written in what it cites: checked as HomeBrain checks an answer's dates.
    const claim = validateAnswer({ text: `${date} ${MONTHS[month - 1]}`, usedFacts: citedFacts.map((fact) => fact.id) }, { facts: citedFacts, question: "", localNow: "", today: context.today });
    if (claim.violations.some((violation) => violation.kind === "unsupported_date")) return { ok: false, why: "unsupported_date" };
    const years = [...citedFacts.map((fact) => fact.text).join(" ").matchAll(YEAR)].map((match) => Number(match[1]));
    if (years.length > 0 ? !years.includes(year) : daysSince(day, item.createdAt.slice(0, 10)) > 60) return { ok: false, why: "wrong_year" };
    if (!isPastWithGrace(day, context.today)) return { ok: false, why: "not_past" };
    return { ok: true, reason, evidence: [{ field: citedFacts[0]!.id, value: day }] };
  }

  if (reason === "superseded") {
    const newerId = verdict.newer ? context.newerLabels.get(verdict.newer.trim()) : undefined;
    if (!newerId) return { ok: false, why: "unknown_newer" };
    return { ok: true, reason, evidence: [{ field: "newer", value: newerId }] };
  }

  // cancelled
  if (context.reconciliation) return { ok: false, why: "on_record" };
  if (!citedFacts.some((fact) => CANCEL_WORDS.test(fact.text))) return { ok: false, why: "not_cancelled" };
  return { ok: true, reason, evidence: [{ field: citedFacts.find((fact) => CANCEL_WORDS.test(fact.text))!.id, value: "cancelled" }] };
}

// --- The day's summary ---------------------------------------------------------------

/** How the summary groups reasons, in the order it names them. */
export const SUMMARY_GROUPS = ["past", "duplicate", "superseded", "cancelled", "unreadable"] as const;
export type SummaryGroup = (typeof SUMMARY_GROUPS)[number];

export function summaryGroupOf(reason: TidyReason): SummaryGroup {
  switch (reason) {
    case "past_date":
      return "past";
    case "already_recorded":
      return "duplicate";
    default:
      return reason;
  }
}

/** One archived item as the day's run keeps it: ids and closed words only, never content. */
export type TidiedEntry = { id: string; reason: TidyReason; by: TidyBy; memberId: string | null };

export function countByGroup(entries: readonly Pick<TidiedEntry, "reason">[]): { group: SummaryGroup; count: number }[] {
  const counts = new Map<SummaryGroup, number>();
  for (const entry of entries) counts.set(summaryGroupOf(entry.reason), (counts.get(summaryGroupOf(entry.reason)) ?? 0) + 1);
  return SUMMARY_GROUPS.filter((group) => counts.has(group)).map((group) => ({ group, count: counts.get(group)! }));
}

