import type { ConfirmationDecision } from "./confirmation";
import { missingRequired, type CompletenessReading } from "./completeness";
import type { HomeSendFailureReason, HomeSendKind, HomeSendStatus } from "./items";
import type { HomeSendReconciliation } from "./reconcile";
import type { IntakeUnderstanding } from "./understanding";
import { FROM_A_FILE } from "./verify";

/**
 * What waits in HomeSend, and for how long (the owner, 2026-11-03: "go,
 * 30-day auto-archive is okay").
 *
 * Pure. Every answer here comes from evidence HomeSend already worked out —
 * the confirmation decision (`confirmation.ts`), what is missing
 * (`completeness.ts`) and what it matched on record (`reconcile.ts`) — and
 * never from a model. Three things read it:
 *
 *   - "Why it waits", in a few words on each waiting row ("a photo",
 *     "amount not clear", "possible duplicate of Science Exhibition").
 *   - Bulk review: which waiting items a person may add with one tap among
 *     several ("Add selected", "Add all I'm sure of"). Only an item that
 *     needs nothing more than a yes qualifies; anything with a choice in it
 *     still opens on its own. No guard is weakened: a bill, receipt or health
 *     document is never bulk-addable unless the Admin's "add directly"
 *     setting already lets it through (`confirmation.ts` returns `govern`
 *     otherwise), and a photo or file never is.
 *   - The lifecycle: after 14 days waiting it is nudged once ("still want
 *     these?"), after 30 days untouched it is archived — kept, hidden from
 *     the inbox, restorable. Real deletion is story 15-013, not here.
 */

/** Days waiting before the grouped reminder asks "still want these?". */
export const STALE_AFTER_DAYS = 14;
/** Days untouched before a waiting or failed item is archived (kept, restorable). */
export const ARCHIVE_AFTER_DAYS = 30;
/** How many times a person may ask HomeSend to read a failed item again — the job queue's own cap. */
export const RETRY_CAP = 5;
/** At most this many items are added in one bulk request; the rest wait for the next. */
export const BULK_LIMIT = 25;

/** The statuses that count as waiting on a person. */
export const WAITING_STATUSES: readonly HomeSendStatus[] = ["received", "classified"];
/** What can be archived: waiting, or failed safely. Restoring puts it back where it was. */
export const ARCHIVABLE_STATUSES: readonly HomeSendStatus[] = ["received", "classified", "failed"];

/** Why an item waits, as a closed code; worded by the screen in the viewer's language. */
export type WaitWhy =
  | { code: "several" }
  | { code: "unclear" }
  | { code: "who" }
  | { code: "amount" }
  | { code: "date" }
  | { code: "detail" }
  | { code: "money" }
  | { code: "health" }
  | { code: "duplicate"; title: string }
  | { code: "update"; title: string }
  | { code: "on_list" }
  | { code: "approval"; area: "groceries" | "school" }
  | { code: "below_bar"; percent: number }
  | { code: "photo" }
  | { code: "instructions" }
  | { code: "by_email" }
  | { code: "untraced" }
  | { code: "check" };

export type WaitEvidence = {
  kind: HomeSendKind | null;
  extracted: (NonNullable<CompletenessReading> & { title?: string | null; needs?: readonly unknown[] | null }) | null;
  understanding: Pick<IntakeUnderstanding, "readable" | "safety" | "check"> | null;
  reconciliation: Pick<HomeSendReconciliation, "existing" | "proposal"> | null;
  confirmation: Pick<ConfirmationDecision, "mode" | "stillNeeded" | "wait" | "reason">;
  /** A document with several records (DDU 2.0): each is confirmed on its own. */
  plan: boolean;
  /** Sent by a household member, not arrived by email. */
  memberInitiated: boolean;
};

function fromAFile(understanding: WaitEvidence["understanding"]): boolean {
  return understanding?.check?.unverified?.includes(FROM_A_FILE) ?? false;
}

/** What is missing, by the most useful thing to say about it. */
function missingWhy(kind: HomeSendKind | null, extracted: WaitEvidence["extracted"]): WaitWhy | null {
  const missing = missingRequired(kind, extracted, { person: true });
  if (missing.length === 0) return null;
  if (missing.some((spec) => spec.answer === "amount")) return { code: "amount" };
  if (missing.some((spec) => spec.answer === "person")) return { code: "who" };
  if (missing.some((spec) => spec.answer === "date")) return { code: "date" };
  return { code: "detail" };
}

/** Why this item waits for a person, from what HomeSend already decided about it. */
export function whyItWaits(evidence: WaitEvidence): WaitWhy {
  const { kind, extracted, understanding, reconciliation, confirmation } = evidence;
  if (evidence.plan) return { code: "several" };
  if (!kind || kind === "unknown" || understanding?.readable === false) return { code: "unclear" };
  const missing = missingWhy(kind, extracted);
  if (missing) return missing;
  if (confirmation.mode === "govern") return kind === "health_document" ? { code: "health" } : { code: "money" };
  if (confirmation.mode === "ask") return /who it'?s for/i.test(confirmation.reason) ? { code: "who" } : { code: "unclear" };
  if (reconciliation) {
    const title = reconciliation.existing.title;
    if (reconciliation.proposal.type === "update" || reconciliation.proposal.type === "cancellation") return { code: "update", title };
    if (!(confirmation.wait?.reason === "on_list")) return { code: "duplicate", title };
  }
  if (confirmation.wait?.reason === "on_list") return { code: "on_list" };
  if (fromAFile(understanding)) return { code: "photo" };
  if (understanding?.safety.instructionsIgnored) return { code: "instructions" };
  if ((extracted?.needs?.length ?? 0) > 0) return { code: "several" };
  if (!evidence.memberInitiated) return { code: "by_email" };
  // Read something the words sent don't contain: nothing was added (the owner, 2026-11-03, decision 3).
  if (confirmation.wait?.reason === "untraced") return { code: "untraced" };
  if (confirmation.wait?.reason === "wait_for_approval") return { code: "approval", area: confirmation.wait.area ?? "groceries" };
  if (confirmation.wait?.reason === "below_bar") return { code: "below_bar", percent: confirmation.wait.percent ?? 95 };
  return { code: "check" };
}

/** The kinds a single yes can add from a list; a receipt's lines are always chosen on its own form. */
const BULK_KINDS: ReadonlySet<HomeSendKind> = new Set(["grocery_item", "school_item", "bill", "health_document"]);

/**
 * Whether one yes, given among several, is all this item needs. True only
 * when the review would open with nothing to decide: a known kind with every
 * required detail, who it is for settled, nothing on record it resembles, not
 * a photo or file, no extra needs or several records, no instructions aimed
 * at WonderHome — and the confirmation is "prepare" or "auto_apply" (never
 * "ask", never "govern": a bill or health document is here only when the
 * Admin's own "add directly" setting already let it past `govern`).
 */
export function bulkReady(evidence: WaitEvidence): boolean {
  const { kind, extracted, understanding, reconciliation, confirmation } = evidence;
  if (!kind || !BULK_KINDS.has(kind)) return false;
  if (confirmation.mode !== "prepare" && confirmation.mode !== "auto_apply") return false;
  if (evidence.plan || reconciliation) return false;
  if (!extracted?.title?.trim()) return false;
  if ((confirmation.stillNeeded?.length ?? 0) > 0 || missingRequired(kind, extracted, { person: true }).length > 0) return false;
  if (confirmation.wait?.reason === "on_list" || confirmation.wait?.listed) return false;
  if (fromAFile(understanding) || understanding?.readable === false || understanding?.safety.instructionsIgnored) return false;
  if ((extracted?.needs?.length ?? 0) > 0) return false;
  return true;
}

/** Whole days between two instants, counted on the household's own calendar. */
export function daysBetween(from: Date, to: Date, timeZone: string): number {
  const day = (at: Date) => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
    } catch {
      return at.toISOString().slice(0, 10);
    }
  };
  return Math.round((Date.parse(day(to)) - Date.parse(day(from))) / 86_400_000);
}

/** Waiting long enough for "still want these?" (14 days, on the household's clock). */
export function isStale(lastTouched: string, now: Date, timeZone: string): boolean {
  return daysBetween(new Date(lastTouched), now, timeZone) >= STALE_AFTER_DAYS;
}

/** Untouched long enough to archive (30 days, on the household's clock). The database's sweep says the same in SQL. */
export function isDueForArchive(item: { status: HomeSendStatus; lastTouched: string }, now: Date, timeZone: string): boolean {
  return ARCHIVABLE_STATUSES.includes(item.status) && daysBetween(new Date(item.lastTouched), now, timeZone) >= ARCHIVE_AFTER_DAYS;
}

/**
 * Failures a second read can help: the page couldn't be reached, the voice
 * note couldn't be made out, or nothing was read. Never one the safety check
 * refused, a file type WonderHome can't read, something too large, or a link
 * to a private address — reading those again would change nothing, or be unsafe.
 */
const RETRIABLE: ReadonlySet<HomeSendFailureReason> = new Set(["link_unreachable", "transcription_failed", "transcription_unavailable", "unreadable"]);

export type RetryState = { allowed: boolean; reason?: "not_retriable" | "cap" | "in_progress"; tries: number };

export function retryState(item: { status: HomeSendStatus; failureReason: HomeSendFailureReason | null; source: string; filePath?: string | null; sourceUrl?: string | null; rawText?: string | null }, lifecycle: { retryCount: number; retryRequestedAt: string | null }): RetryState {
  const tries = lifecycle.retryCount;
  if (item.status !== "failed" || !item.failureReason || !RETRIABLE.has(item.failureReason)) return { allowed: false, reason: "not_retriable", tries };
  // Something to read again: the page's address, the file kept in storage, or the words kept.
  if (!item.sourceUrl && !item.filePath && !item.rawText) return { allowed: false, reason: "not_retriable", tries };
  if (lifecycle.retryRequestedAt) return { allowed: false, reason: "in_progress", tries };
  if (tries >= RETRY_CAP) return { allowed: false, reason: "cap", tries };
  return { allowed: true, tries };
}

// --- The grouped reminder ----------------------------------------------------

/** How the grouped reminder counts what waits: by kind, with photos/files and failures on their own. */
export type WaitingGroup = "school_item" | "bill" | "grocery_item" | "health_document" | "receipt" | "event" | "photo" | "failed" | "other";

export type WaitingRow = { status: string; classified_kind: string | null; content_type?: string | null; source?: string | null; updated_at: string };

const FILE_TYPE = /^(image\/|application\/pdf)/;

export function waitingGroupOf(row: WaitingRow): WaitingGroup {
  if (row.status === "failed") return "failed";
  const kind = row.classified_kind;
  if (kind === "school_item" || kind === "activity_item") return "school_item";
  if (kind === "bill" || kind === "grocery_item" || kind === "health_document" || kind === "receipt" || kind === "event") return kind;
  if (row.content_type && FILE_TYPE.test(row.content_type)) return "photo";
  return "other";
}

/** The order a reminder names its groups in: most consequential first. */
export const GROUP_ORDER: readonly WaitingGroup[] = ["bill", "health_document", "school_item", "event", "grocery_item", "receipt", "photo", "other", "failed"];

export function countWaiting(rows: readonly WaitingRow[]): { total: number; groups: { group: WaitingGroup; count: number }[] } {
  const counts = new Map<WaitingGroup, number>();
  for (const row of rows) counts.set(waitingGroupOf(row), (counts.get(waitingGroupOf(row)) ?? 0) + 1);
  return { total: rows.length, groups: GROUP_ORDER.filter((group) => counts.has(group)).map((group) => ({ group, count: counts.get(group)! })) };
}
