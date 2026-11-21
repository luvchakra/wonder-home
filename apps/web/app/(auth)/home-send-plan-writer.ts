import "server-only";

import { listObligations } from "@wonderhome/core/finance/repository";
import { applyDocumentPlan, type PlanWriter } from "@wonderhome/core/homesend/apply";
import { recordHomeSendChange } from "@wonderhome/core/homesend/changes";
import type { HomeSendItem } from "@wonderhome/core/homesend/items";
import type { PlanEntry } from "@wonderhome/core/homesend/plan";
import { recordDocumentApplied } from "@wonderhome/core/homesend/repository";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";
import { listSchoolItems } from "@wonderhome/core/school/repository";

import { planFor } from "./home-send-review";
import { createNew, reviseExisting, type Membership, type RouteInput, type Supabase } from "./home-send-writes";

/**
 * Writing a document's plan (DDU 2.0): the writer a person's Apply uses, and,
 * since 2026-11-21, the same writes at once for something sent in with
 * several dated things (a school circular's PTM, things to bring, a fee) —
 * "Since PR #563 a document's several bills are added at once", generalised.
 * Kept out of the "use server" file so no part of it is a callable action.
 */

/** What the one-item write path needs, from a plan entry the server itself built. */
export function routeInputFor(entry: PlanEntry, householdId: string, itemId: string): RouteInput {
  const record = entry.record;
  return {
    householdId,
    itemId,
    decision: entry.action === "update" ? "update" : entry.action === "cancel" ? "cancel" : "add",
    existingId: entry.existing?.id,
    kind: entry.domain,
    title: entry.title.slice(0, 160),
    notes: [record.notes, record.location ? `Where: ${record.location}` : null].filter(Boolean).join(" · ") || undefined,
    billKind: (record.billKind as RouteInput["billKind"]) ?? undefined,
    payee: record.payee ?? undefined,
    amount: record.amount ?? undefined,
    currency: record.currency ?? undefined,
    dueDate: record.date ?? undefined,
    dueTime: record.time ?? undefined,
    endTime: record.endTime ?? undefined,
    childMemberId: entry.person?.memberId,
    schoolKind: SCHOOL_ITEM_KINDS.find((kind) => kind === record.schoolKind) ?? "event",
    subject: record.subject ?? undefined,
    quantity: record.quantity ?? undefined,
    unit: record.unit ?? undefined,
    needs: [],
  };
}

/**
 * Did the update actually land? (§51 E2: verify database outcome.) Read the
 * record back through the same client and compare what the plan changed.
 */
async function verifyUpdate(supabase: Supabase, householdId: string, entry: PlanEntry, timezone: string): Promise<void> {
  const record = entry.record;
  if (entry.domain === "bill") {
    const bill = entry.existing?.id ? (await listObligations(supabase, householdId, { id: entry.existing.id }))[0] : undefined;
    if (!bill) throw new Error("not found after update");
    if (record.date && bill.dueOn !== record.date) throw new Error("due date did not change");
    if (record.amount !== null && bill.amountMinor !== Math.round(record.amount * 100)) throw new Error("amount did not change");
    return;
  }
  if (entry.domain === "school_item" && record.date) {
    const item = entry.existing?.id ? (await listSchoolItems(supabase, householdId, { id: entry.existing.id }))[0] : undefined;
    const day = item?.dueAt ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(item.dueAt) : null;
    if (day !== record.date) throw new Error("date did not change");
  }
}

export function writerFor(supabase: Supabase, membership: Membership, itemId: string, auto?: { state: "unconfirmed" | "confirmed"; source: string | null }): PlanWriter {
  const householdId = membership.household.id;
  return {
    async create(entry) {
      const created = await createNew(supabase, membership, routeInputFor(entry, householdId, itemId));
      if ("error" in created) throw new Error(created.error);
      // A grocery already tracked is put on To buy rather than added twice; undo then takes back only that.
      return { entityId: created.routedId, ...(created.changeType === "updated" ? { previous: created.previous } : {}) };
    },
    async update(entry) {
      if (!entry.existing) throw new Error("nothing to update");
      const revised = await reviseExisting(supabase, membership, { ...routeInputFor(entry, householdId, itemId), existingId: entry.existing.id, decision: "update" });
      await verifyUpdate(supabase, householdId, entry, membership.household.timezone);
      return { entityId: revised.routedId, previous: revised.previous };
    },
    async cancel(entry) {
      if (!entry.existing) throw new Error("nothing to cancel");
      const revised = await reviseExisting(supabase, membership, { ...routeInputFor(entry, householdId, itemId), existingId: entry.existing.id, decision: "cancel" });
      return { entityId: revised.routedId, previous: revised.previous };
    },
    async record(entry, result, changeType) {
      const change = await recordHomeSendChange(supabase, {
        householdId,
        intakeId: itemId,
        domain: entry.domain,
        entityId: result.entityId,
        createdByMemberId: membership.memberId,
        changeType: changeType === "created" && result.previous ? "updated" : changeType,
        previous: result.previous ?? null,
        planKey: entry.key,
        fields: entry.changes,
        evidence: entry.evidence,
        // Added at once from what was sent (2026-11-21): Checking when read from a photo or file.
        ...(auto ? { auto: { state: auto.state, confidence: null, source: auto.source } } : {}),
      });
      return change.id;
    },
  };
}

export const ROUTED_TABLE: Record<PlanEntry["domain"], string> = { bill: "obligations", school_item: "school_items", grocery_item: "consumables" };

/**
 * Every new or changed thing a document's plan holds, written now through the
 * same governed writes and Undo as a person's Apply, each linked to the one
 * source item. Nothing the plan would ask about (which child?) and nothing it
 * would cancel is written: those wait for a person. Checking when read from a
 * photo or file. Null when there was nothing to write.
 */
export async function applyPlanAtOnce(
  supabase: Supabase,
  membership: Membership,
  item: HomeSendItem,
): Promise<{ count: number; titles: string[]; checking: boolean } | null> {
  const plan = await planFor(supabase, membership, item);
  if (!plan) return null;
  const include = new Set(plan.entries.filter((entry) => entry.included && !entry.question && (entry.action === "create" || entry.action === "update")).map((entry) => entry.key));
  if (include.size === 0) return null;
  const checking = Boolean(item.filePath) || item.source === "whatsapp_media" || item.source === "manual_upload" || item.source === "email_attachment";
  const receipt = await applyDocumentPlan(plan, include, writerFor(supabase, membership, item.id, { state: checking ? "unconfirmed" : "confirmed", source: item.source }), { intakeId: item.id });
  const first = receipt.changes.find((change) => change.changeId && change.entityId);
  await recordDocumentApplied(supabase, membership.household.id, item.id, {
    plan,
    receipt,
    routed: first ? { table: ROUTED_TABLE[first.domain], id: first.entityId! } : null,
    review: first ? { decision: receipt.counts.created > 0 ? "added" : "updated", proposal: receipt.counts.updated > 0 ? "update" : null, subject: "resolved", corrected: false } : null,
  });
  const written = receipt.changes.filter((change) => change.changeId && change.entityId);
  if (written.length === 0) return null;
  const titles = plan.entries.filter((entry) => include.has(entry.key)).map((entry) => entry.record.title).slice(0, 5);
  return { count: written.length, titles, checking };
}
