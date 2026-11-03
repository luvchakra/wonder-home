"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient } from "@wonderhome/core/db/server";
import { claimWaitingHomeSendItem, getHomeSendItem, listHomeSendLifecycle, markHomeSendRetryRequested, NO_LIFECYCLE, PENDING_STATUSES, restoreHomeSendItem } from "@wonderhome/core/homesend/repository";
import { enqueueReread } from "@wonderhome/core/homesend/retry-queue";
import { BULK_LIMIT, bulkReady, RETRY_CAP, retryState } from "@wonderhome/core/homesend/waiting";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { hitRateLimitFair, rateLimitMessage } from "@wonderhome/core/security/rate-limit";

import { autoApplyHomeSendItem } from "./home-send-auto";
import { prepareReview } from "./home-send-review";
import { waitEvidence } from "../_lib/homesend-waiting";

/**
 * HomeSend's list actions (the owner, 2026-11-03): add several waiting items
 * with one yes, read a failed one again, put an archived one back.
 *
 * Bulk add is the single confirm, item by item — never a shortcut around it.
 * Each id is read again on the server, still waiting, its review prepared
 * afresh on this member's own client (who it is for, what is on record, the
 * household's settings), and only an item that needs nothing but a yes
 * (`bulkReady`) is written, through the same governed create a person's
 * confirm uses (`autoApplyHomeSendItem` with the person's decision), recorded
 * as a change with its own Undo and audit row. Anything else is left waiting
 * and said so, by name. What the browser sent is a list of ids, nothing more.
 */

export type BulkAddResult = { id: string; title: string; added: boolean };
export type BulkAddState = { error?: string; results?: BulkAddResult[] };

const bulkSchema = z.object({ householdId: z.uuid(), itemIds: z.array(z.uuid()).min(1).max(BULK_LIMIT) });

function revalidateAll() {
  for (const path of ["/ai", "/home-send", "/bills", "/school", "/groceries", "/health", "/notifications"]) revalidatePath(path);
}

export async function addSelectedHomeSendItemsAction(_previous: BulkAddState, formData: FormData): Promise<BulkAddState> {
  const ids = [...new Set(formData.getAll("itemId").filter((value): value is string => typeof value === "string"))];
  const parsed = bulkSchema.safeParse({ householdId: formData.get("householdId"), itemIds: ids });
  if (!parsed.success) return { error: ids.length > BULK_LIMIT ? `Choose up to ${BULK_LIMIT} at a time.` : "Choose at least one to add." };
  const { householdId, itemIds } = parsed.data;

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    // HomeSend's review is for grown-ups (the page shows a child its own view, never the list).
    if (membership.memberType === "child") return { error: "Ask a grown-up to check these." };
    const results: BulkAddResult[] = [];
    // One at a time, in the order chosen: each is its own confirm, and one that fails never stops the rest.
    for (const id of itemIds) {
      const item = await getHomeSendItem(supabase, householdId, id).catch(() => null);
      const title = item?.extracted?.title?.trim() || item?.understanding?.contentSummary || "";
      if (!item || !PENDING_STATUSES.includes(item.status)) {
        results.push({ id, title, added: false });
        continue;
      }
      try {
        const review = await prepareReview(supabase, membership, item);
        // Only one request writes an item, however many were sent at once.
        if (!bulkReady(waitEvidence(item, review)) || !(await claimWaitingHomeSendItem(supabase, householdId, id))) {
          results.push({ id, title, added: false });
          continue;
        }
        const applied = await autoApplyHomeSendItem(supabase, membership, { id: item.id, kind: item.classifiedKind ?? "unknown", extracted: item.extracted, subject: review.subject }, { decision: "added" });
        results.push({ id, title: applied?.title ?? title, added: Boolean(applied) });
      } catch (thrown) {
        log.warn("homesend bulk add: one item not added", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
        results.push({ id, title, added: false });
      }
    }
    revalidateAll();
    return { results };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

export type ItemActionState = { error?: string; done?: "retry_queued" | "restored"; itemId?: string };

const itemSchema = z.object({ householdId: z.uuid(), itemId: z.uuid() });

/**
 * "Try again" on an item that failed safely: counted on the item (five at
 * most), rate limited like any outside read, and queued on the job queue —
 * the delivery clock reads it within minutes, never this request.
 */
export async function retryHomeSendItemAction(_previous: ItemActionState, formData: FormData): Promise<ItemActionState> {
  const parsed = itemSchema.safeParse({ householdId: formData.get("householdId"), itemId: formData.get("itemId") });
  if (!parsed.success) return { error: "Please try again." };
  const { householdId, itemId } = parsed.data;
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    // The rate-limit counter and the job queue are service-role only; the grant covers this member's household alone.
    const admin = adminClientFor(adminGrant.member(membership, "count and queue a HomeSend read-again"), householdId);
    if (!(await hitRateLimitFair(admin, "homesend.retry", { memberId: membership.memberId, householdId }))) return { error: rateLimitMessage("homesend.retry"), itemId };
    const [item, lifecycle] = await Promise.all([getHomeSendItem(supabase, householdId, itemId), listHomeSendLifecycle(supabase, householdId, [itemId])]);
    if (!item) return { error: "That item isn't here any more.", itemId };
    const state = retryState(item, lifecycle.get(itemId) ?? NO_LIFECYCLE);
    if (!state.allowed) {
      if (state.reason === "cap") return { error: `WonderHome has tried ${RETRY_CAP} times. Fill it in by hand, or dismiss it.`, itemId };
      if (state.reason === "in_progress") return { done: "retry_queued", itemId };
      return { error: "Reading this again won't help. Fill it in by hand, or dismiss it.", itemId };
    }
    const marked = await markHomeSendRetryRequested(supabase, householdId, itemId, { cap: RETRY_CAP, tries: state.tries, actorMemberId: membership.memberId });
    if (!marked) return { done: "retry_queued", itemId };
    await enqueueReread(admin, { householdId, itemId });
    revalidatePath("/home-send");
    return { done: "retry_queued", itemId };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message, itemId };
  }
}

/** The archive's Undo: back to waiting (or failed), with its 30 days starting again. */
export async function restoreHomeSendItemAction(_previous: ItemActionState, formData: FormData): Promise<ItemActionState> {
  const parsed = itemSchema.safeParse({ householdId: formData.get("householdId"), itemId: formData.get("itemId") });
  if (!parsed.success) return { error: "Please try again." };
  const { householdId, itemId } = parsed.data;
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    await restoreHomeSendItem(supabase, householdId, itemId, membership.memberId);
    revalidatePath("/home-send");
    revalidatePath("/notifications");
    return { done: "restored", itemId };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message, itemId };
  }
}
