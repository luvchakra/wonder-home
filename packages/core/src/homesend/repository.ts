import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import type {
  HomeSendExtraction,
  HomeSendFailureReason,
  HomeSendItem,
  HomeSendKind,
  HomeSendSecurityStatus,
  HomeSendSource,
  HomeSendStatus,
} from "./items";
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
    createdAt: row.created_at as string,
  };
}

const SELECT_COLUMNS =
  "id, household_id, created_by_member_id, source, file_path, raw_text, status, classified_kind, extracted, routed_table, routed_id, security_status, external_id, sender_address, content_type, content_hash, source_url, subject, parent_item_id, understanding, transcript_confidence, failure_reason, created_at";

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
  options?: { status?: HomeSendStatus },
): Promise<HomeSendItem[]> {
  let query = supabase
    .from("home_send_items")
    .select(SELECT_COLUMNS)
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });
  if (options?.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) throw new Error(`listHomeSendItems failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => fromRow(row as Row));
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
  input: { routedTable: string; routedId: string },
): Promise<void> {
  const { error } = await supabase
    .from("home_send_items")
    .update({ status: "routed", routed_table: input.routedTable, routed_id: input.routedId, routed_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .eq("id", itemId);

  if (error) throw new Error(`routeHomeSendItem failed: ${error.code ?? "unknown"}`);
}

/** The other half of sending something in (CLAUDE.md rule 12): saying it was not worth acting on. */
export async function dismissHomeSendItem(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  actorMemberId: string,
): Promise<void> {
  const { error } = await supabase
    .from("home_send_items")
    .update({ status: "dismissed" })
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
