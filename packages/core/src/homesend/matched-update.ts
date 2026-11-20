import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { cancelObligation, createObligation, listObligations, updateObligation } from "../finance/repository";
import { recordHomeSendChange } from "./changes";
import { missingRequired } from "./completeness";
import { billShape } from "./record-types";
import type { HomeSendExtraction, HomeSendKind } from "./items";
import { reconcileHomeSend, type HomeSendCandidate, type HomeSendReconciliation, type ReconcilableDomain } from "./reconcile";

/**
 * "Update the existing bill?" applied (the owner, 2026-11-20: "update"). A
 * bill sent in that matches one already on record with a newer amount or date
 * is never added as a second bill and never left waiting: its Needs-you
 * question (`deadlines.ts` `updateQuestion`) ends here, by a person's tap or
 * the 24-hour default.
 *
 *   - "update": the new amount and/or date go onto the bill through the
 *     governed `updateObligation` a person's "Update" uses, recorded as a
 *     HomeSend change with what it replaced, so Undo puts it back. A default's
 *     update is marked Checking ("not yet confirmed", "check before paying"),
 *     its reminders on; a person's own tap is confirmed.
 *   - "cancel": a person's tap only — the bill is stood down (never deleted),
 *     with Undo.
 *   - "flag": a cancellation nobody answered: the bill stays as it is, marked
 *     Checking, and the item notes the message said it was called off.
 *
 * Paying never happens. The match is read again at the moment of writing,
 * through the same reconciliation the review shows, and the item is claimed
 * with a compare-and-swap first, so a person who settled it meanwhile wins.
 */

type Row = Record<string, unknown>;

/** Kinds whose matched record has a governed update and Undo. A receipt or health document has none: its match is a duplicate. */
const REVISABLE_KINDS: Partial<Record<HomeSendKind, ReconcilableDomain>> = { bill: "bill" };

export type MatchedUpdateResult = "done" | "settled";

/** What the item matches on record now, or null (not one of these kinds, not readable, or nothing on record). */
export async function matchOnRecord(
  client: SupabaseClient,
  householdId: string,
  item: { kind: HomeSendKind | null; extracted: Partial<HomeSendExtraction> | null; change: string | null; createdAt: string },
  options: { timezone: string; now: Date },
): Promise<HomeSendReconciliation | null> {
  const domain = candidateDomain(item.kind);
  const title = item.extracted?.title?.trim();
  if (!domain || !title) return null;
  const candidate: HomeSendCandidate = {
    kind: domain,
    title,
    date: item.extracted?.dueDate ?? item.extracted?.documentDate ?? null,
    amount: typeof item.extracted?.amount === "number" ? item.extracted.amount : null,
    payee: item.extracted?.payee ?? null,
    subjectMemberId: null,
    capturedAt: item.createdAt,
    change: item.change === "update" || item.change === "cancellation" ? item.change : "new",
  };
  return reconcileHomeSend(client, householdId, candidate, { timezone: options.timezone, now: options.now, strict: true });
}

/** Bills reconcile as bills, health documents as health records; a receipt has nothing to reconcile with (09-009). */
function candidateDomain(kind: HomeSendKind | null): ReconcilableDomain | null {
  if (kind === "bill") return "bill";
  if (kind === "health_document") return "health_document";
  return null;
}

export async function applyMatchedUpdate(
  client: SupabaseClient,
  householdId: string,
  itemId: string,
  how: { mode: "update" | "cancel" | "flag"; checking: boolean; byDefault: boolean; memberId: string | null; now: Date },
): Promise<MatchedUpdateResult> {
  const { data: itemRow, error } = await client
    .from("home_send_items")
    .select("id, status, updated_at, classified_kind, extracted, created_by_member_id, created_at, change:understanding->>change")
    .eq("household_id", householdId)
    .eq("id", itemId)
    .in("status", ["received", "classified"])
    .maybeSingle();
  if (error) throw new Error(`matched-bill read failed: ${error.code ?? "unknown"}`);
  if (!itemRow) return "settled";
  const row = itemRow as Row;
  const kind = (row.classified_kind as HomeSendKind | null) ?? null;
  if (!kind || !REVISABLE_KINDS[kind]) return "settled";

  const { data: household } = await client.from("households").select("timezone, owner_member_id").eq("id", householdId).maybeSingle();
  const timezone = ((household?.timezone as string | null) || "UTC") as string;
  const match = await matchOnRecord(client, householdId, { kind, extracted: (row.extracted as Partial<HomeSendExtraction> | null) ?? null, change: (row.change as string | null) ?? null, createdAt: row.created_at as string }, { timezone, now: how.now });
  const proposal = match?.proposal.type;
  // Updated meanwhile (by hand, or by another copy): what it says is already on record.
  if (match && proposal === "duplicate") return setAsideAsRecorded(client, householdId, row, how);
  if (!match || (proposal !== "update" && proposal !== "cancellation")) return "settled";

  const existing = (await listObligations(client, householdId, { id: match.existingId }))[0];
  if (!existing || existing.status === "cancelled") return "settled";
  const previous = { dueOn: existing.dueOn, amountMinor: existing.amountMinor, status: existing.status };
  // A cancellation can't be "updated", and an update can't be cancelled: the tap and the match must agree; else it is kept Checking.
  const mode = how.mode === "update" && proposal !== "update" ? "flag" : how.mode === "cancel" && proposal !== "cancellation" ? "flag" : how.mode;
  const checking = how.checking || mode === "flag";
  // Whose name a default's change row carries (the row needs a member; the audit says "default"): the sender, else the owner, always an Admin.
  const actor = how.memberId ?? (row.created_by_member_id as string | null) ?? ((household?.owner_member_id as string | null) ?? null);
  if (!actor) return "settled";

  // Claim the item first, so a person's tap and the default never both write.
  const decision = mode === "update" ? "updated" : mode === "cancel" ? "cancelled" : "kept_existing";
  const { data: claimed, error: claimError } = await client
    .from("home_send_items")
    .update({
      status: "routed",
      routed_table: "obligations",
      routed_id: existing.id,
      routed_at: how.now.toISOString(),
      review_decision: decision,
      review_proposal: proposal,
      review_subject: "not_needed",
      review_corrected: false,
      reviewed_at: how.now.toISOString(),
    })
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", row.status as string)
    .eq("updated_at", row.updated_at as string)
    .select("id");
  if (claimError) throw new Error(`matched-bill claim failed: ${claimError.code ?? "unknown"}`);
  if ((claimed ?? []).length === 0) return "settled";

  try {
    if (mode === "update") {
      const changes = proposal === "update" && match.proposal.type === "update" ? match.proposal.changes : [];
      const date = changes.find((change) => change.field === "date")?.to;
      const amount = changes.find((change) => change.field === "amount")?.to;
      const currency = ((row.extracted as Partial<HomeSendExtraction> | null)?.currency ?? null) || existing.currency || null;
      await updateObligation(client, {
        id: existing.id,
        householdId,
        ...(typeof date === "string" ? { dueOn: date } : {}),
        ...(typeof amount === "number" ? { amountMinor: amount, currency } : {}),
      });
    } else if (mode === "cancel") {
      await cancelObligation(client, { id: existing.id, householdId });
    }
  } catch (thrown) {
    // Not written: the item goes back to waiting exactly as it was, and the question closes at 48 hours.
    await client
      .from("home_send_items")
      .update({ status: row.status, routed_table: null, routed_id: null, routed_at: null, review_decision: null, review_proposal: null, review_subject: null, review_corrected: null, reviewed_at: null })
      .eq("household_id", householdId)
      .eq("id", itemId);
    throw thrown;
  }

  // The change, with what it replaced (Undo), Checking when a default made it or it was only flagged.
  await recordHomeSendChange(client, {
    householdId,
    intakeId: itemId,
    domain: "bill",
    entityId: existing.id,
    createdByMemberId: actor,
    changeType: mode === "cancel" ? "cancelled" : "updated",
    previous,
    ...(checking ? { auto: { state: "unconfirmed" as const, confidence: null, source: how.byDefault ? "needs_you_default" : "needs_you" } } : {}),
  });
  await auditChange({
    householdId,
    actorMemberId: how.byDefault ? undefined : (how.memberId ?? undefined),
    eventType: "homesend.matched_update",
    targetTable: "obligations",
    targetId: existing.id,
    metadata: {
      intakeId: itemId,
      mode,
      by: how.byDefault ? "default" : "person",
      checking,
      // The note a flagged record carries: a message said it was called off, and it was kept.
      ...(mode === "flag" ? { note: "said_cancelled_kept" } : {}),
    },
  });
  return "done";
}

/** The new copy says nothing the record doesn't already: set aside as "already on record". */
async function setAsideAsRecorded(client: SupabaseClient, householdId: string, row: Row, how: { byDefault: boolean; memberId: string | null; now: Date }): Promise<MatchedUpdateResult> {
  const { data } = await client
    .from("home_send_items")
    .update({ status: "archived", archived_from: row.status, archived_at: how.now.toISOString(), archive_reason: "already_recorded", retry_requested_at: null })
    .eq("household_id", householdId)
    .eq("id", row.id as string)
    .eq("status", row.status as string)
    .eq("updated_at", row.updated_at as string)
    .select("id");
  if ((data ?? []).length === 0) return "settled";
  await auditChange({
    householdId,
    actorMemberId: how.byDefault ? undefined : (how.memberId ?? undefined),
    eventType: "homesend.auto_archived",
    targetTable: "home_send_items",
    targetId: row.id as string,
    metadata: { reason: "already_recorded", by: how.byDefault ? "default" : "person", from: row.status, question: "homesend_update" },
  });
  return "done";
}

/**
 * A waiting bill that matches nothing on record, in a household that records
 * money entries directly ("Money and health entries": Checking or confirmed):
 * recorded now as Checking, as record first would have done had it arrived
 * after 14 Nov (decision 2). Through the governed `createObligation` a
 * person's Add uses, recorded as a HomeSend change (Undo), audited
 * `homesend.auto_added`, its reminders on and saying "check before paying".
 * Never paid. A bill missing its amount or due date, or a document with
 * several records, is left to a person. Claimed first (by its review
 * columns: a routed item needs its table and id together), so a person's
 * own confirm meanwhile wins.
 */
export async function recordWaitingBill(client: SupabaseClient, householdId: string, itemId: string, now: Date): Promise<MatchedUpdateResult> {
  const { data: itemRow, error } = await client
    .from("home_send_items")
    .select("id, status, updated_at, classified_kind, extracted, created_by_member_id, records:understanding->document->records")
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", "classified")
    .maybeSingle();
  if (error) throw new Error(`waiting-bill read failed: ${error.code ?? "unknown"}`);
  const row = itemRow as Row | null;
  if (!row || row.classified_kind !== "bill") return "settled";
  if (Array.isArray(row.records) && row.records.length > 1) return "settled";
  const read = (row.extracted as Partial<HomeSendExtraction> | null) ?? null;
  const title = read?.title?.trim();
  if (!title || !read) return "settled";
  const amount = typeof read.amount === "number" && read.amount > 0 ? read.amount : null;
  if (missingRequired("bill", { title, dueDate: read.dueDate ?? null, payee: read.payee ?? null, amount }).length > 0) return "settled";
  const { data: household } = await client.from("households").select("owner_member_id").eq("id", householdId).maybeSingle();
  const actor = (row.created_by_member_id as string | null) ?? ((household?.owner_member_id as string | null) ?? null);
  if (!actor) return "settled";

  // Claimed by its review columns alone (it stays "classified"): a routed item needs its table and id together
  // (`home_send_items_routed_together`), and the bill doesn't exist yet. A person who settled it meanwhile wins.
  const { data: claimed, error: claimError } = await client
    .from("home_send_items")
    .update({ review_decision: "auto_added", review_subject: "not_needed", review_corrected: false, reviewed_at: now.toISOString() })
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", "classified")
    .eq("updated_at", row.updated_at as string)
    .select("id, updated_at");
  if (claimError) throw new Error(`waiting-bill claim failed: ${claimError.code ?? "unknown"}`);
  if ((claimed ?? []).length === 0) return "settled";

  let created: { id: string };
  try {
    const shape = billShape({ title, payee: read.payee ?? null, kind: null });
    created = await createObligation(client, {
      householdId,
      name: title.slice(0, 160),
      kind: shape.kind,
      billType: shape.billType,
      recurrence: shape.recurrence,
      payee: read.payee?.trim().slice(0, 120) || null,
      amountMinor: amount !== null ? Math.round(amount * 100) : null,
      currency: amount !== null ? read.currency || null : null,
      dueOn: read.dueDate?.slice(0, 10) || null,
    });
  } catch (thrown) {
    await client
      .from("home_send_items")
      .update({ review_decision: null, review_subject: null, review_corrected: null, reviewed_at: null })
      .eq("household_id", householdId)
      .eq("id", itemId);
    throw thrown;
  }
  // Routed, its table and id together, only on the claim we hold.
  const { error: routeError } = await client
    .from("home_send_items")
    .update({ status: "routed", routed_table: "obligations", routed_id: created.id, routed_at: now.toISOString() })
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("status", "classified");
  if (routeError) {
    // Never left as a bill nobody can see came from here: stood down (a status, never a delete), and it waits again.
    await cancelObligation(client, { id: created.id, householdId }).catch(() => undefined);
    await client.from("home_send_items").update({ review_decision: null, review_subject: null, review_corrected: null, reviewed_at: null }).eq("household_id", householdId).eq("id", itemId);
    throw new Error(`waiting-bill route failed: ${routeError.code ?? "unknown"}`);
  }
  await recordHomeSendChange(client, {
    householdId,
    intakeId: itemId,
    domain: "bill",
    entityId: created.id,
    createdByMemberId: actor,
    auto: { state: "unconfirmed", confidence: null, source: "nothing_waits" },
  });
  return "done";
}
