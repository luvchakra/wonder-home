import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import type { RecordedReceipt } from "../commerce/receipt-stock";
import type {
  HomeSendExtraction,
  HomeSendFailureReason,
  HomeSendItem,
  HomeSendKind,
  HomeSendReviewDecision,
  HomeSendReviewOutcome,
  HomeSendSecurityStatus,
  HomeSendSource,
  HomeSendStatus,
} from "./items";
import type { IntakeChangeReceipt } from "./apply";
import type { DocumentPlan } from "./plan";
import { ARCHIVE_REASONS, type ArchiveReason } from "./archive-reasons";
import { mayRemoveHomeSendItem, type RemoveActor } from "./remove";
import type { IntakeUnderstanding } from "./understanding";

/**
 * Reading and writing HomeSend intake (Phase C).
 *
 * Every write here only ever touches `home_send_items` — routing an item
 * into a real domain table is a separate call, made by the caller, to that
 * domain's own governed create function (`createObligation`,
 * `createSchoolItem`, `createConsumable`). Nothing in this file writes
 * outside its own table.
 */

type Row = Record<string, unknown>;

function fromRow(row: Row): HomeSendItem {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    createdByMemberId: (row.created_by_member_id as string | null) ?? null,
    source: row.source as HomeSendSource,
    filePath: (row.file_path as string | null) ?? null,
    rawText: (row.raw_text as string | null) ?? null,
    status: row.status as HomeSendStatus,
    classifiedKind: (row.classified_kind as HomeSendKind | null) ?? null,
    extracted: (row.extracted as HomeSendExtraction | null) ?? null,
    routedTable: (row.routed_table as string | null) ?? null,
    routedId: (row.routed_id as string | null) ?? null,
    securityStatus: row.security_status as HomeSendSecurityStatus,
    externalId: (row.external_id as string | null) ?? null,
    senderAddress: (row.sender_address as string | null) ?? null,
    contentType: (row.content_type as string | null) ?? null,
    contentHash: (row.content_hash as string | null) ?? null,
    sourceUrl: (row.source_url as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    parentItemId: (row.parent_item_id as string | null) ?? null,
    understanding: (row.understanding as IntakeUnderstanding | null) ?? null,
    transcriptConfidence: row.transcript_confidence === null || row.transcript_confidence === undefined ? null : Number(row.transcript_confidence),
    failureReason: (row.failure_reason as HomeSendFailureReason | null) ?? null,
    reviewDecision: (row.review_decision as HomeSendReviewDecision | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    receipt: (row.receipt as IntakeChangeReceipt | null) ?? null,
    createdAt: row.created_at as string,
  };
}

const SELECT_COLUMNS =
  "id, household_id, created_by_member_id, source, file_path, raw_text, status, classified_kind, extracted, routed_table, routed_id, security_status, external_id, sender_address, content_type, content_hash, source_url, subject, parent_item_id, understanding, transcript_confidence, failure_reason, review_decision, reviewed_at, receipt, created_at";

/** The item a provider already delivered with this id, if any — so a retried webhook never creates a second one (§15). */
export async function findByExternalId(supabase: SupabaseClient, householdId: string, externalId: string): Promise<HomeSendItem | null> {
  const { data, error } = await supabase
    .from("home_send_items")
    .select(SELECT_COLUMNS)
    .eq("household_id", householdId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error(`findByExternalId failed: ${error.code ?? "unknown"}`);
  return data ? fromRow(data as Row) : null;
}

/** Items still waiting on a person — "Needs your review" (§14). */
export const PENDING_STATUSES: readonly HomeSendStatus[] = ["received", "classified"];

/**
 * The item already waiting with exactly this content, if someone sends the
 * same thing twice (§15). Only a pending one counts: something routed or
 * dismissed last week, sent again today, is a fresh intake.
 */
export async function findPendingByContentHash(supabase: SupabaseClient, householdId: string, contentHash: string): Promise<HomeSendItem | null> {
  const { data, error } = await supabase
    .from("home_send_items")
    .select(SELECT_COLUMNS)
    .eq("household_id", householdId)
    .eq("content_hash", contentHash)
    .in("status", [...PENDING_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findPendingByContentHash failed: ${error.code ?? "unknown"}`);
  return data ? fromRow(data as Row) : null;
}

export async function listHomeSendItems(
  supabase: SupabaseClient,
  householdId: string,
  options?: { status?: HomeSendStatus; since?: Date; limit?: number },
): Promise<HomeSendItem[]> {
  let query = supabase
    .from("home_send_items")
    .select(SELECT_COLUMNS)
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });
  if (options?.status) query = query.eq("status", options.status);
  if (options?.since) query = query.gte("created_at", options.since.toISOString());
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw new Error(`listHomeSendItems failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => fromRow(row as Row));
}

/**
 * The household's notes (2026-11-14, "Nothing waits"): items HomeSend
 * couldn't tell the kind of, kept rather than left waiting. They are the
 * HomeSend items themselves (archived, reason `kept_as_note`): the words stay
 * where they arrived, on HomeSend's own table, with their source, audit and
 * Restore — never copied into HomeBrain's memories, where untrusted content
 * would read as a belief. HomeTalk reads them as context, newest first.
 */
export async function listHouseholdNotes(supabase: SupabaseClient, householdId: string, limit = 30): Promise<HomeSendItem[]> {
  const { data, error } = await supabase
    .from("home_send_items")
    .select(SELECT_COLUMNS)
    .eq("household_id", householdId)
    .eq("status", "archived")
    .eq("archive_reason", "kept_as_note")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as Row[]).map((row) => ({ ...fromRow(row), householdNote: true }));
}

/**
 * Receipts this household already recorded, as they were read — shop, day and
 * total — for catching the same receipt sent twice (HomeFood 25-003b). An
 * undone receipt is not recorded any more and does not count.
 */
export async function listRecordedReceipts(supabase: SupabaseClient, householdId: string): Promise<RecordedReceipt[]> {
  const { data, error } = await supabase
    .from("home_send_items")
    .select("id, extracted, reviewed_at, created_at")
    .eq("household_id", householdId)
    .eq("status", "routed")
    .eq("routed_table", "consumable_purchases")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`listRecordedReceipts failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map((row) => {
    const read = (row.extracted ?? {}) as { merchant?: unknown; documentDate?: unknown; amount?: unknown };
    return {
      id: row.id as string,
      merchant: typeof read.merchant === "string" ? read.merchant : null,
      purchasedOn: typeof read.documentDate === "string" ? read.documentDate : null,
      total: typeof read.amount === "number" ? read.amount : null,
      recordedAt: ((row.reviewed_at as string | null) ?? (row.created_at as string)) as string,
    };
  });
}

export async function getHomeSendItem(supabase: SupabaseClient, householdId: string, itemId: string): Promise<HomeSendItem | null> {
  const { data, error } = await supabase.from("home_send_items").select(SELECT_COLUMNS).eq("household_id", householdId).eq("id", itemId).maybeSingle();
  if (error) throw new Error(`getHomeSendItem failed: ${error.code ?? "unknown"}`);
  return data ? fromRow(data as Row) : null;
}

export type CreateHomeSendItemInput = {
  /** Pre-generated by the caller so it can double as the storage path segment for an upload. */
  id: string;
  householdId: string;
  /** Null only for an email attachment, which, like its email, nobody in the household typed in. */
  createdByMemberId: string | null;
  source: HomeSendSource;
  filePath?: string | null;
  rawText?: string | null;
  /** Defaults to `not_applicable` (pasted text has no file to check). */
  securityStatus?: HomeSendSecurityStatus;
  contentType?: string | null;
  contentHash?: string | null;
  sourceUrl?: string | null;
  transcriptConfidence?: number | null;
  /** Set when the item failed safely on arrival: it is kept, in "Failed safely", never classified. */
  failureReason?: HomeSendFailureReason | null;
  /** The email an attachment came with. */
  parentItemId?: string | null;
  /** The provider's id, for idempotent re-delivery. */
  externalId?: string | null;
  subject?: string | null;
  senderAddress?: string | null;
};

export async function createHomeSendItem(
  supabase: SupabaseClient,
  input: CreateHomeSendItemInput,
): Promise<HomeSendItem> {
  const securityStatus = input.securityStatus ?? "not_applicable";

  const { data, error } = await supabase
    .from("home_send_items")
    .insert({
      id: input.id,
      household_id: input.householdId,
      created_by_member_id: input.createdByMemberId,
      source: input.source,
      file_path: input.filePath ?? null,
      raw_text: input.rawText ?? null,
      security_status: securityStatus,
      content_type: input.contentType ?? null,
      content_hash: input.contentHash ?? null,
      source_url: input.sourceUrl ?? null,
      transcript_confidence: input.transcriptConfidence ?? null,
      status: input.failureReason ? "failed" : "received",
      failure_reason: input.failureReason ?? null,
      parent_item_id: input.parentItemId ?? null,
      external_id: input.externalId ?? null,
      subject: input.subject ?? null,
      sender_address: input.senderAddress ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot send items to this household.");
    throw new Error(`createHomeSendItem failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.createdByMemberId,
    eventType: "homesend.intake_received",
    targetTable: "home_send_items",
    targetId: input.id,
    metadata: { source: input.source },
  });
  if (securityStatus === "rejected") {
    await auditChange({
      householdId: input.householdId,
      actorMemberId: input.createdByMemberId,
      eventType: "homesend.security_rejected",
      targetTable: "home_send_items",
      targetId: input.id,
      metadata: { source: input.source },
    });
  }

  return fromRow(data as Row);
}

export type CreateEmailHomeSendItemInput = {
  householdId: string;
  /** The provider's own message id — the idempotency key. Re-delivery of the same id is a no-op, not a duplicate row. */
  externalId: string;
  senderAddress: string | null;
  rawText: string;
  subject?: string | null;
  contentHash?: string | null;
};

/**
 * The email-webhook half of intake — always called with the admin client
 * (a webhook has no household session), always with no acting member (see
 * the migration's `home_send_items_actor_matches_source` constraint). An
 * `on conflict do nothing` against `(household_id, external_id)` is what
 * makes a re-delivered webhook harmless instead of a second intake row.
 */
export async function createEmailHomeSendItem(
  supabase: SupabaseClient,
  input: CreateEmailHomeSendItemInput,
): Promise<{ item: HomeSendItem; duplicate: boolean }> {
  const id = crypto.randomUUID();

  const { data, error } = await supabase
    .from("home_send_items")
    .upsert(
      {
        id,
        household_id: input.householdId,
        created_by_member_id: null,
        source: "email",
        raw_text: input.rawText,
        external_id: input.externalId,
        sender_address: input.senderAddress,
        subject: input.subject ?? null,
        content_hash: input.contentHash ?? null,
        security_status: "not_applicable",
      },
      { onConflict: "household_id,external_id", ignoreDuplicates: true },
    )
    .select(SELECT_COLUMNS);

  if (error) throw new Error(`createEmailHomeSendItem failed: ${error.code ?? "unknown"}`);

  if (data && data.length > 0) {
    await auditChange({
      householdId: input.householdId,
      actorMemberId: null,
      eventType: "homesend.intake_received",
      targetTable: "home_send_items",
      targetId: id,
      metadata: { source: "email" },
    });
    return { item: fromRow(data[0] as Row), duplicate: false };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("home_send_items")
    .select(SELECT_COLUMNS)
    .eq("household_id", input.householdId)
    .eq("external_id", input.externalId)
    .single();
  if (fetchError) throw new Error(`createEmailHomeSendItem lookup failed: ${fetchError.code ?? "unknown"}`);

  return { item: fromRow(existing as Row), duplicate: true };
}

export async function setHomeSendClassification(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  input: {
    classifiedKind: HomeSendKind;
    extracted: HomeSendExtraction;
    understanding?: IntakeUnderstanding | null;
    /** A transcript or a fetched page's text, saved alongside its reading. */
    rawText?: string | null;
    transcriptConfidence?: number | null;
  },
): Promise<void> {
  const update: Record<string, unknown> = { status: "classified", classified_kind: input.classifiedKind, extracted: input.extracted };
  if (input.understanding !== undefined) update.understanding = input.understanding;
  if (input.rawText) update.raw_text = input.rawText;
  if (input.transcriptConfidence !== undefined) update.transcript_confidence = input.transcriptConfidence;
  const { error } = await supabase
    .from("home_send_items")
    .update(update)
    .eq("household_id", householdId)
    .eq("id", itemId);

  if (error) throw new Error(`setHomeSendClassification failed: ${error.code ?? "unknown"}`);
}

export async function routeHomeSendItem(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  input: { routedTable: string; routedId: string; review?: HomeSendReviewOutcome },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("home_send_items")
    .update({ status: "routed", routed_table: input.routedTable, routed_id: input.routedId, routed_at: now, ...reviewColumns(input.review, now) })
    .eq("household_id", householdId)
    .eq("id", itemId);

  if (error) throw new Error(`routeHomeSendItem failed: ${error.code ?? "unknown"}`);
}

/** The review outcome's columns (§19) — closed words and a boolean, never content. */
function reviewColumns(review: HomeSendReviewOutcome | undefined, at: string): Record<string, unknown> {
  if (!review) return {};
  return {
    review_decision: review.decision,
    review_proposal: review.proposal ?? null,
    review_subject: review.subject ?? null,
    review_corrected: review.corrected ?? null,
    reviewed_at: at,
  };
}

/** The other half of sending something in (CLAUDE.md rule 12): saying it was not worth acting on. */
export async function dismissHomeSendItem(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  actorMemberId: string,
  review: HomeSendReviewOutcome = { decision: "dismissed" },
): Promise<void> {
  const { error } = await supabase
    .from("home_send_items")
    .update({ status: "dismissed", ...reviewColumns(review, new Date().toISOString()) })
    .eq("household_id", householdId)
    .eq("id", itemId);

  if (error) throw new Error(`dismissHomeSendItem failed: ${error.code ?? "unknown"}`);

  await auditChange({
    householdId,
    actorMemberId,
    eventType: "homesend.dismissed",
    targetTable: "home_send_items",
    targetId: itemId,
  });
}

/** Flips a routed item's status once its one change has been undone — the record of what was routed (`routed_table`/`routed_id`) is kept, never erased. */
export async function markHomeSendUndone(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
): Promise<void> {
  const { error } = await supabase
    .from("home_send_items")
    .update({ status: "undone" })
    .eq("household_id", householdId)
    .eq("id", itemId);

  if (error) throw new Error(`markHomeSendUndone failed: ${error.code ?? "unknown"}`);
}

/**
 * An item that arrived but cannot go on — refused, unreadable, a link that
 * would not open, a voice note nothing could hear. It is kept and shown
 * under "Failed safely" (§14), never deleted: a provider outage or a bad
 * file must never lose what a household sent.
 */
export async function markHomeSendFailed(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  reason: HomeSendFailureReason,
  extra?: { rawText?: string | null; understanding?: IntakeUnderstanding | null },
): Promise<void> {
  const update: Record<string, unknown> = { status: "failed", failure_reason: reason };
  if (extra?.rawText) update.raw_text = extra.rawText;
  if (extra?.understanding) update.understanding = extra.understanding;
  const { error } = await supabase.from("home_send_items").update(update).eq("household_id", householdId).eq("id", itemId);
  if (error) throw new Error(`markHomeSendFailed failed: ${error.code ?? "unknown"}`);
}

/**
 * What applying a document's plan did, kept on the item (DDU 2.0 §22, §44):
 * the plan as applied and its receipt. Something written routes the item to
 * its first write; nothing new at all sets it aside as kept; a result still
 * waiting on an answer, or one where every write failed, stays in review so
 * the person can come back to it.
 */
export async function recordDocumentApplied(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  input: { plan: DocumentPlan; receipt: IntakeChangeReceipt; routed: { table: string; id: string } | null; review: HomeSendReviewOutcome | null },
): Promise<void> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { plan: input.plan, receipt: input.receipt };
  if (input.routed) {
    Object.assign(update, { status: "routed", routed_table: input.routed.table, routed_id: input.routed.id, routed_at: now, ...reviewColumns(input.review ?? undefined, now) });
  } else if (input.receipt.status === "no_change") {
    Object.assign(update, { status: "dismissed", ...reviewColumns(input.review ?? { decision: "kept_existing" }, now) });
  }
  const { error } = await supabase.from("home_send_items").update(update).eq("household_id", householdId).eq("id", itemId);
  if (error) throw new Error(`recordDocumentApplied failed: ${error.code ?? "unknown"}`);
}

// --- Lifecycle: archive, restore, try again (the owner, 2026-11-03) ---------

/** What the lifecycle keeps beside an item. Every field is optional on the table, so readers default it. */
export type HomeSendLifecycle = {
  archivedAt: string | null;
  /** Where Restore puts it back: waiting or failed. */
  archivedFrom: HomeSendStatus | null;
  /** Times a person asked HomeSend to read it again (capped, `waiting.ts` RETRY_CAP). */
  retryCount: number;
  /** Set while a read-again is queued; cleared when it has run. */
  retryRequestedAt: string | null;
  /** When it last changed — what "untouched for 30 days" is counted from. */
  updatedAt: string | null;
};

export const NO_LIFECYCLE: HomeSendLifecycle = { archivedAt: null, archivedFrom: null, retryCount: 0, retryRequestedAt: null, updatedAt: null };

/**
 * The lifecycle columns for these items, by id. Read on their own, never in
 * `SELECT_COLUMNS`: before the lifecycle migration is applied the columns are
 * missing, this read fails, and every item reads as never archived and never
 * retried — the inbox keeps working in either order (CLAUDE.md, migrations).
 */
export async function listHomeSendLifecycle(supabase: SupabaseClient, householdId: string, ids: readonly string[]): Promise<Map<string, HomeSendLifecycle>> {
  const map = new Map<string, HomeSendLifecycle>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("home_send_items")
    .select("id, archived_at, archived_from, retry_count, retry_requested_at, updated_at")
    .eq("household_id", householdId)
    .in("id", ids.slice(0, 500));
  if (error) return map;
  for (const row of (data ?? []) as Row[]) {
    map.set(row.id as string, {
      archivedAt: (row.archived_at as string | null) ?? null,
      archivedFrom: (row.archived_from as HomeSendStatus | null) ?? null,
      retryCount: Number(row.retry_count ?? 0) || 0,
      retryRequestedAt: (row.retry_requested_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
    });
  }
  return map;
}

/** Archived items, newest archived first; empty before the migration (no row can be `archived` yet). */
export async function listArchivedHomeSendItems(supabase: SupabaseClient, householdId: string, limit = 50): Promise<HomeSendItem[]> {
  const { data, error } = await supabase
    .from("home_send_items")
    .select(SELECT_COLUMNS)
    .eq("household_id", householdId)
    .eq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) return [];
  return (data ?? []).map((row) => fromRow(row as Row));
}

/**
 * Why each archived item was set aside (`archive_reason`, the daily tidy's
 * migration), by id. Read on its own: before that migration the column is
 * missing, this read fails, and no reason is shown.
 */
export async function listArchiveReasons(supabase: SupabaseClient, householdId: string, ids: readonly string[]): Promise<Map<string, ArchiveReason>> {
  const map = new Map<string, ArchiveReason>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from("home_send_items").select("id, archive_reason").eq("household_id", householdId).in("id", [...ids]).limit(ids.length);
  if (error) return map;
  for (const row of (data ?? []) as Row[]) {
    const reason = row.archive_reason as string | null;
    if (reason && (ARCHIVE_REASONS as readonly string[]).includes(reason)) map.set(row.id as string, reason as ArchiveReason);
  }
  return map;
}

/** How many are archived, for the "Archived (N)" link; 0 when it can't be read. */
export async function countArchivedHomeSendItems(supabase: SupabaseClient, householdId: string): Promise<number> {
  const { count, error } = await supabase.from("home_send_items").select("id", { count: "exact", head: true }).eq("household_id", householdId).eq("status", "archived");
  return error ? 0 : (count ?? 0);
}

/**
 * Restore (the archive's Undo): back to where it was, waiting or failed, and
 * its 30 days start again (the update touches `updated_at`). Only an archived
 * item moves; anything else is left alone, so a double tap does nothing twice.
 */
export async function restoreHomeSendItem(supabase: SupabaseClient, householdId: string, itemId: string, actorMemberId: string): Promise<boolean> {
  const { data: current, error: readError } = await supabase
    .from("home_send_items")
    .select("archived_from")
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", "archived")
    .maybeSingle();
  if (readError) throw new Error(`restoreHomeSendItem failed: ${readError.code ?? "unknown"}`);
  if (!current) return false;
  const back = (current as Row).archived_from;
  const status: HomeSendStatus = back === "received" || back === "failed" ? back : "classified";
  const { data, error } = await supabase
    .from("home_send_items")
    .update({ status, archived_at: null, archived_from: null })
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", "archived")
    .select("id");
  if (error) throw new Error(`restoreHomeSendItem failed: ${error.code ?? "unknown"}`);
  const moved = (data ?? []).length > 0;
  if (moved) await auditChange({ householdId, actorMemberId, eventType: "homesend.restored", targetTable: "home_send_items", targetId: itemId });
  return moved;
}

/**
 * "Archive all" and "Archive these" (the owner, 2026-11-03): every waiting or
 * failed item of this household — or just the ids given — set aside in one
 * go, each remembering where it came from so Restore puts it back. No checks
 * per item: archiving adds nothing and deletes nothing. One update per status
 * the rows were in (the archived-from column must name it), bounded by
 * `limit`. Returns the ids that moved, so the screen's Undo can put back
 * exactly those.
 */
export async function archiveWaitingHomeSendItems(
  supabase: SupabaseClient,
  householdId: string,
  input: { ids?: readonly string[]; limit: number; now?: Date },
): Promise<string[]> {
  let query = supabase.from("home_send_items").select("id, status").eq("household_id", householdId).in("status", ["received", "classified", "failed"]);
  if (input.ids) query = query.in("id", input.ids.slice(0, input.limit));
  const { data: rows, error: readError } = await query.order("created_at", { ascending: true }).limit(input.limit);
  if (readError) throw new Error(`archiveWaitingHomeSendItems failed: ${readError.code ?? "unknown"}`);
  const byStatus = new Map<string, string[]>();
  for (const row of (rows ?? []) as Row[]) byStatus.set(row.status as string, [...(byStatus.get(row.status as string) ?? []), row.id as string]);
  const at = (input.now ?? new Date()).toISOString();
  const moved: string[] = [];
  for (const [status, ids] of byStatus) {
    const { data, error } = await supabase
      .from("home_send_items")
      .update({ status: "archived", archived_from: status, archived_at: at, retry_requested_at: null })
      .eq("household_id", householdId)
      .eq("status", status)
      .in("id", ids)
      .select("id");
    if (error) throw new Error(`archiveWaitingHomeSendItems failed: ${error.code ?? "unknown"}`);
    moved.push(...((data ?? []) as Row[]).map((row) => row.id as string));
  }
  return moved;
}

/**
 * The Undo after "Archive all": exactly these archived items back to where
 * each was, in one update per place. Anything no longer archived is left alone.
 */
export async function restoreHomeSendItems(supabase: SupabaseClient, householdId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data: rows, error: readError } = await supabase
    .from("home_send_items")
    .select("id, archived_from, archive_reason")
    .eq("household_id", householdId)
    .eq("status", "archived")
    .in("id", ids.slice(0, 500));
  if (readError) throw new Error(`restoreHomeSendItems failed: ${readError.code ?? "unknown"}`);
  const byPlace = new Map<HomeSendStatus, string[]>();
  for (const row of (rows ?? []) as Row[]) {
    const back = row.archived_from;
    // A routed source item is archived by the daily tidy, which this Undo never touches, or removed by a
    // person after its entry was undone, which comes back as that (undone) item.
    if (back === "routed" && row.archive_reason !== "removed_by_person") continue;
    const status: HomeSendStatus = back === "routed" ? "undone" : back === "received" || back === "failed" ? back : "classified";
    byPlace.set(status, [...(byPlace.get(status) ?? []), row.id as string]);
  }
  const restored: string[] = [];
  for (const [status, list] of byPlace) {
    const { data, error } = await supabase
      .from("home_send_items")
      .update({ status, archived_at: null, archived_from: null })
      .eq("household_id", householdId)
      .eq("status", "archived")
      .in("id", list)
      .select("id");
    if (error) throw new Error(`restoreHomeSendItems failed: ${error.code ?? "unknown"}`);
    restored.push(...((data ?? []) as Row[]).map((row) => row.id as string));
  }
  return restored;
}

/**
 * Marks a failed item as asked to be read again, and counts the try — only
 * while it is still failed, nothing is already queued, and it is under the
 * cap; otherwise nothing changes and false comes back. The read itself runs
 * on the job queue (`retry-queue.ts`).
 */
export async function markHomeSendRetryRequested(supabase: SupabaseClient, householdId: string, itemId: string, input: { cap: number; tries: number; actorMemberId: string; now?: Date }): Promise<boolean> {
  if (input.tries >= input.cap) return false;
  const { data, error } = await supabase
    .from("home_send_items")
    .update({ retry_count: input.tries + 1, retry_requested_at: (input.now ?? new Date()).toISOString() })
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", "failed")
    .eq("retry_count", input.tries)
    .is("retry_requested_at", null)
    .select("id");
  if (error) throw new Error(`markHomeSendRetryRequested failed: ${error.code ?? "unknown"}`);
  const marked = (data ?? []).length > 0;
  if (marked) await auditChange({ householdId, actorMemberId: input.actorMemberId, eventType: "homesend.retry_requested", targetTable: "home_send_items", targetId: itemId, metadata: { attempt: input.tries + 1 } });
  return marked;
}

/** The read-again has run, whatever came of it: the row may be asked again (under the cap). */
export async function clearHomeSendRetryRequested(supabase: SupabaseClient, householdId: string, itemId: string): Promise<void> {
  const { error } = await supabase.from("home_send_items").update({ retry_requested_at: null }).eq("household_id", householdId).eq("id", itemId);
  if (error) throw new Error(`clearHomeSendRetryRequested failed: ${error.code ?? "unknown"}`);
}

/**
 * The 30-day archive, for every household, in one bounded call to the
 * database (`public.archive_stale_home_send_items`): an item waiting or
 * failed and untouched for 30 days on its household's own calendar becomes
 * `archived` — kept, restorable. Idempotent: an archived item is not waiting,
 * so a second run finds nothing. Before the migration the function is
 * missing and this archives nothing.
 */
export async function archiveStaleHomeSendItems(admin: SupabaseClient, input: { now?: Date; limit?: number } = {}): Promise<number> {
  const { data, error } = await admin.rpc("archive_stale_home_send_items", { p_now: (input.now ?? new Date()).toISOString(), p_limit: Math.min(Math.max(input.limit ?? 200, 1), 1000) });
  if (error) return 0;
  return typeof data === "number" ? data : Number(data ?? 0) || 0;
}

/**
 * Claims a waiting item for one write, so two overlapping requests (a double
 * tap, two people adding at once) never both add it: a compare-and-swap on
 * `updated_at`, which the row's trigger moves on every update. Only the
 * request whose update matched the time it read goes on; the other is told
 * no. A claim that is never followed by a write leaves the item waiting.
 */
export async function claimWaitingHomeSendItem(supabase: SupabaseClient, householdId: string, itemId: string): Promise<boolean> {
  const { data: current, error: readError } = await supabase
    .from("home_send_items")
    .select("status, updated_at")
    .eq("household_id", householdId)
    .eq("id", itemId)
    .maybeSingle();
  if (readError || !current) return false;
  const row = current as Row;
  if (!PENDING_STATUSES.includes(row.status as HomeSendStatus)) return false;
  const { data, error } = await supabase
    .from("home_send_items")
    .update({ status: row.status })
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", row.status as string)
    .eq("updated_at", row.updated_at as string)
    .select("id");
  if (error) return false;
  return (data ?? []).length > 0;
}


/** Where an item was when removed, in the closed set the `archived_from` check allows. */
function archivedFromFor(status: string, routedTable: string | null): HomeSendStatus {
  if (status === "received" || status === "failed" || status === "classified") return status;
  return routedTable ? "routed" : "classified";
}

/**
 * Remove (the owner, 2026-11-03): these items archived with the reason
 * `removed_by_person`, each remembering where it was, so Restore puts it back.
 * Waiting, failed, added and dismissed items alike; anything already archived
 * is left alone. Only items the actor may remove move (`mayRemoveHomeSendItem`,
 * checked here against the rows themselves, never the ids' say-so). Returns
 * what moved, and whether each had been added (routed), for the screen's words.
 */
export async function removeHomeSendItems(
  supabase: SupabaseClient,
  householdId: string,
  ids: readonly string[],
  actor: RemoveActor,
  now: Date = new Date(),
): Promise<{ moved: string[]; refused: number }> {
  if (ids.length === 0) return { moved: [], refused: 0 };
  const { data: rows, error: readError } = await supabase
    .from("home_send_items")
    .select("id, status, routed_table, created_by_member_id")
    .eq("household_id", householdId)
    .in("id", ids.slice(0, 500))
    .neq("status", "archived");
  if (readError) throw new Error(`removeHomeSendItems failed: ${readError.code ?? "unknown"}`);
  const allowed = ((rows ?? []) as Row[]).filter((row) => mayRemoveHomeSendItem(actor, { createdByMemberId: (row.created_by_member_id as string | null) ?? null }));
  const refused = ((rows ?? []) as Row[]).length - allowed.length;
  const byPlace = new Map<HomeSendStatus, string[]>();
  for (const row of allowed) {
    const from = archivedFromFor(row.status as string, (row.routed_table as string | null) ?? null);
    byPlace.set(from, [...(byPlace.get(from) ?? []), row.id as string]);
  }
  const moved: string[] = [];
  for (const [from, list] of byPlace) {
    const { data, error } = await supabase
      .from("home_send_items")
      .update({ status: "archived", archived_from: from, archived_at: now.toISOString(), archive_reason: "removed_by_person", retry_requested_at: null })
      .eq("household_id", householdId)
      .in("id", list)
      .neq("status", "archived")
      .select("id");
    if (error) throw new Error(`removeHomeSendItems failed: ${error.code ?? "unknown"}`);
    moved.push(...((data ?? []) as Row[]).map((row) => row.id as string));
  }
  return { moved, refused };
}

/**
 * Delete for good (the owner, 2026-11-03): archived items only, removed from
 * the table together with their stored file and their attachments' files. Only
 * the intake item goes — whatever it added to a domain table stays, so an item
 * that still has a live change on record is kept and counted. Only the items
 * the actor may remove are touched; the database's delete policy checks again.
 * Returns the ids deleted and how many were kept.
 */
export async function deleteArchivedHomeSendItems(
  supabase: SupabaseClient,
  householdId: string,
  input: { ids?: readonly string[]; actor: RemoveActor; limit?: number },
): Promise<{ deleted: string[]; kept: number }> {
  const limit = Math.min(input.limit ?? 500, 500);
  let query = supabase.from("home_send_items").select("id, file_path, created_by_member_id").eq("household_id", householdId).eq("status", "archived");
  if (input.ids) query = query.in("id", input.ids.slice(0, limit));
  const { data: rows, error: readError } = await query.limit(limit);
  if (readError) throw new Error(`deleteArchivedHomeSendItems failed: ${readError.code ?? "unknown"}`);
  const mine = ((rows ?? []) as Row[]).filter((row) => mayRemoveHomeSendItem(input.actor, { createdByMemberId: (row.created_by_member_id as string | null) ?? null }));
  if (mine.length === 0) return { deleted: [], kept: 0 };
  const ids = mine.map((row) => row.id as string);
  const [live, children] = await Promise.all([
    supabase.from("homesend_changes").select("intake_id").eq("household_id", householdId).in("intake_id", ids).is("undone_at", null).limit(1000),
    supabase.from("home_send_items").select("parent_item_id, file_path").eq("household_id", householdId).in("parent_item_id", ids).limit(1000),
  ]);
  if (live.error) throw new Error(`deleteArchivedHomeSendItems failed: ${live.error.code ?? "unknown"}`);
  const withEntry = new Set(((live.data ?? []) as Row[]).map((row) => row.intake_id as string));
  const doomed = mine.filter((row) => !withEntry.has(row.id as string));
  const doomedIds = new Set(doomed.map((row) => row.id as string));
  const paths = [
    ...doomed.map((row) => row.file_path as string | null),
    ...(((children.data ?? []) as Row[]).filter((row) => doomedIds.has(row.parent_item_id as string)).map((row) => row.file_path as string | null)),
  ].filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("home-send").remove(paths);
    if (storageError) throw new Error("deleteArchivedHomeSendItems failed: storage");
  }
  if (doomed.length === 0) return { deleted: [], kept: withEntry.size };
  const { data, error } = await supabase.from("home_send_items").delete().eq("household_id", householdId).eq("status", "archived").in("id", [...doomedIds]).select("id");
  if (error) throw new Error(`deleteArchivedHomeSendItems failed: ${error.code ?? "unknown"}`);
  return { deleted: ((data ?? []) as Row[]).map((row) => row.id as string), kept: withEntry.size };
}
